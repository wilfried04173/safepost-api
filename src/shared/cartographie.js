import { env } from '../config/env.js';
import { arcDirect, arrondirTrace, distanceM, simplifierTrace } from './domaine/geometrie.js';

/**
 * Calcul de la carte d'une expédition : géocodage des deux adresses (Nominatim) puis
 * itinéraire routier (OSRM), tous deux issus d'OpenStreetMap et sans clé d'API.
 *
 * Ce calcul se fait UNE fois, dans l'API, à la création (ou quand une adresse est
 * corrigée), et le résultat est stocké sur l'expédition. La page de suivi n'interroge
 * ensuite aucun service de cartographie :
 *  - la politique d'usage de Nominatim interdit un appel par consultation de page
 *    (1 requête par seconde au maximum, pour toute l'application) ;
 *  - l'adresse IP des visiteurs ne part pas chez un tiers ;
 *  - une panne d'OSRM (serveur de démonstration, sans engagement de disponibilité)
 *    n'efface pas les cartes déjà calculées.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const DELAI_MS = 20_000;
// Un long trajet peut peser plusieurs dizaines de Ko : sur une connexion lente, son
// téléchargement dépasse vite 20 s. Le délai couvre la réponse ENTIÈRE, pas seulement
// ses en-têtes.
const DELAI_OSRM_MS = 45_000;
const ESPACEMENT_NOMINATIM_MS = 1_100;
const TOLERANCE_SIMPLIFICATION_M = 50;
// Au-delà, le tracé est re-simplifié avec une tolérance plus large (trajets très longs).
const POINTS_MAX = 800;
// OSRM « colle » chaque extrémité à la route la plus proche de sa base. Le serveur de
// démonstration ne couvre que l'Europe : New York y est collé au Portugal, à 5 500 km,
// et donne un itinéraire crédible mais faux. Au-delà de cette distance, pas de route.
const DECALAGE_MAX_M = 5_000;

// Partagé par tout le processus : deux géocodages d'affilée (expéditeur puis
// destinataire) sont espacés d'au moins 1,1 s, comme l'exige Nominatim.
let dernierAppelNominatim = 0;
async function attendreLeTourNominatim() {
  const attente = dernierAppelNominatim + ESPACEMENT_NOMINATIM_MS - Date.now();
  if (attente > 0) await new Promise((resolve) => setTimeout(resolve, attente));
  dernierAppelNominatim = Date.now();
}

/**
 * Requête HTTP renvoyant `{ ok, status, donnees }` (donnees = JSON lu, ou null).
 *
 * Le corps est lu DANS la même tentative et sous le même délai que la requête : une
 * réponse dont le téléchargement est coupé compte comme un délai dépassé, et déclenche
 * une seconde tentative (ces services gratuits ont parfois une réponse lente isolée).
 * `avant` s'exécute avant chaque tentative (espacement imposé par Nominatim).
 */
async function requeteJson(url, options, { avant = async () => {}, delaiMs = DELAI_MS } = {}) {
  for (let tentative = 1; ; tentative += 1) {
    await avant();
    try {
      const reponse = await fetch(url, { ...options, signal: AbortSignal.timeout(delaiMs) });
      const corps = await reponse.text();
      let donnees = null;
      try {
        donnees = JSON.parse(corps);
      } catch {
        /* réponse qui n'est pas du JSON (page d'erreur) : donnees reste null */
      }
      return { ok: reponse.ok, status: reponse.status, donnees };
    } catch (error) {
      const passager = ['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name);
      if (!passager || tentative >= 2) throw error;
    }
  }
}

/**
 * Décode une polyligne encodée (format Google, précision 6) en points `[lat, lon]`.
 * OSRM la renvoie avec `geometries=polyline6` : environ 8 fois plus léger que le GeoJSON,
 * et déjà dans l'ordre latitude, longitude.
 */
export function decoderPolyline(chaine, precision = 6) {
  const facteur = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const lireValeur = () => {
    let resultat = 0;
    let decalage = 0;
    let octet;
    do {
      octet = chaine.charCodeAt(index) - 63;
      index += 1;
      resultat |= (octet & 0x1f) << decalage;
      decalage += 5;
    } while (octet >= 0x20);
    return resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
  };

  while (index < chaine.length) {
    lat += lireValeur();
    lon += lireValeur();
    points.push([lat / facteur, lon / facteur]);
  }
  return points;
}

const normaliserCodePostal = (valeur) => String(valeur || '').replace(/\s+/g, '').toUpperCase();

/**
 * Requêtes de géocodage de la plus précise à la moins précise. Nominatim est bien moins
 * tolérant que Google : un nom de résidence ou un numéro de bâtiment dans la ligne
 * d'adresse suffit à le faire échouer. On se rabat alors sur la ville, puis le code postal.
 * `degradee` : la réponse devra correspondre au code postal saisi (voir plus bas).
 */
function variantesDeRecherche(partie) {
  const pays = partie.country?.trim();
  const ville = partie.city?.trim();
  const cp = partie.postalCode?.trim();
  const rue = partie.addressLine?.trim();

  // Recherche libre : retrouve souvent une adresse quand un champ a été mal rempli
  // (le pays saisi dans le champ ville, par exemple). Contrôlée comme une requête dégradée.
  const texteLibre = [rue, cp, ville, pays].filter(Boolean).join(', ');

  const variantes = [
    { street: rue, city: ville, postalcode: cp, country: pays, degradee: false },
    { q: texteLibre, degradee: true },
    { city: ville, postalcode: cp, country: pays, degradee: true },
    { city: ville, country: pays, degradee: true },
    { postalcode: cp, country: pays, degradee: true },
  ];

  // Retire les champs vides, les variantes sans lieu exploitable et les doublons.
  const vues = new Set();
  return variantes
    .map((variante) => Object.fromEntries(Object.entries(variante).filter(([, valeur]) => valeur !== undefined && valeur !== '')))
    .filter((variante) => variante.city || variante.postalcode || variante.street || variante.q)
    .filter((variante) => {
      const cle = JSON.stringify({ ...variante, degradee: undefined });
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
}

async function rechercherNominatim(variante) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '1' });
  // Nominatim refuse de combiner la recherche libre (`q`) et les champs structurés.
  for (const champ of variante.q ? ['q'] : ['street', 'city', 'postalcode', 'country']) {
    if (variante[champ]) params.set(champ, variante[champ]);
  }

  const { ok, status, donnees } = await requeteJson(
    `${NOMINATIM_URL}?${params}`,
    { headers: { 'User-Agent': env.cartoUserAgent, 'Accept-Language': 'fr,en' } },
    { avant: attendreLeTourNominatim },
  );
  if (!ok || !Array.isArray(donnees)) throw new Error(`Nominatim HTTP ${status}`);
  return donnees[0] || null;
}

/**
 * Coordonnées d'une partie (expéditeur ou destinataire), ou `null` si introuvable.
 *
 * Garde-fou essentiel : sur une requête dégradée, Nominatim peut renvoyer un lieu
 * homonyme ailleurs (même nom de commune dans un autre département, même code postal
 * dans un autre pays). Une carte fausse est pire que pas de carte : si le code postal
 * rendu ne correspond pas à celui saisi, la réponse est écartée.
 */
async function geocoder(partie) {
  const cpAttendu = normaliserCodePostal(partie.postalCode);

  for (const variante of variantesDeRecherche(partie)) {
    const resultat = await rechercherNominatim(variante);
    if (!resultat) continue;

    const cpRendu = normaliserCodePostal(resultat.address?.postcode);
    if (variante.degradee && cpAttendu && cpRendu && cpRendu !== cpAttendu) continue;

    const lat = Number(resultat.lat);
    const lon = Number(resultat.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    return {
      lat,
      lon,
      libelle: [partie.city, partie.country].filter(Boolean).join(', '),
    };
  }
  return null;
}

/**
 * Itinéraire routier entre deux points, ou `null` s'il n'en existe pas (mer entre les
 * deux, par exemple). Attention à l'ordre : l'URL d'OSRM attend `longitude,latitude`,
 * alors que la polyligne renvoyée se décode en `[lat, lon]`.
 */
async function itineraireRoutier(depart, destination) {
  const coords = `${depart.lon},${depart.lat};${destination.lon},${destination.lat}`;
  const { ok, status, donnees } = await requeteJson(
    `${OSRM_URL}/${coords}?overview=full&geometries=polyline6`,
    { headers: { 'User-Agent': env.cartoUserAgent } },
    { delaiMs: DELAI_OSRM_MS },
  );

  if (donnees?.code === 'NoRoute') return null;
  if (!ok || donnees?.code !== 'Ok' || !donnees.routes?.length) {
    throw new Error(`OSRM ${donnees?.code || `HTTP ${status}`}`);
  }

  if (donnees.waypoints?.some((point) => point.distance > DECALAGE_MAX_M)) return null;

  const route = donnees.routes[0];
  const points = decoderPolyline(route.geometry);

  // Tracé complet (`overview=full`) simplifié ici à 50 m près : quelques Ko au lieu
  // de plusieurs dizaines, sans couper les virages comme `overview=simplified`.
  let tolerance = TOLERANCE_SIMPLIFICATION_M;
  let trace = simplifierTrace(points, tolerance);
  while (trace.length > POINTS_MAX) {
    tolerance *= 2;
    trace = simplifierTrace(points, tolerance);
  }

  return {
    trace: arrondirTrace(trace),
    // La vraie distance routière, pas celle du tracé simplifié.
    distanceM: Math.round(route.distance),
  };
}

/**
 * Carte complète d'une expédition. Ne lève JAMAIS : une adresse introuvable ou un
 * service indisponible ne doit pas empêcher d'enregistrer un colis. En cas de
 * problème, l'objet porte `echec` (raison, visible côté agence seulement) et la page
 * de suivi s'affiche simplement sans carte.
 */
export async function calculerCarte(expediteur, destinataire) {
  const calculeLe = new Date();
  try {
    const depart = await geocoder(expediteur);
    if (!depart) return { calculeLe, echec: "Adresse de l'expéditeur introuvable sur la carte" };
    const destination = await geocoder(destinataire);
    if (!destination) return { depart, calculeLe, echec: 'Adresse du destinataire introuvable sur la carte' };

    const a = [depart.lat, depart.lon];
    const b = [destination.lat, destination.lon];
    const route = await itineraireRoutier(depart, destination);

    if (route) return { depart, destination, ...route, mode: 'route', calculeLe };

    // Pas de route carrossable : ligne directe, courbée le long du grand cercle.
    return {
      depart,
      destination,
      trace: arrondirTrace(arcDirect(a, b)),
      distanceM: Math.round(distanceM(a, b)),
      mode: 'direct',
      calculeLe,
    };
  } catch (error) {
    const raison = error?.name === 'TimeoutError' ? 'délai dépassé' : error?.message || 'erreur inconnue';
    return { calculeLe, echec: `Service de cartographie indisponible (${raison})` };
  }
}

/** Les champs d'adresse qui déterminent la carte : en changer impose un nouveau calcul. */
export function adresseModifiee(avant, apres) {
  if (!apres) return false;
  return ['addressLine', 'postalCode', 'city', 'country'].some(
    (champ) => String(avant?.[champ] || '').trim() !== String(apres?.[champ] || '').trim(),
  );
}
