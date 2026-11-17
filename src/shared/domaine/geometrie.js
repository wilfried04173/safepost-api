/**
 * Géométrie d'un trajet, sans aucune dépendance.
 *
 * Convention : un point est `[latitude, longitude]` (l'ordre de Leaflet). OSRM et
 * GeoJSON utilisent l'ordre inverse, `[longitude, latitude]` : la conversion se fait
 * une seule fois, à la lecture de leur réponse (voir `cartographie.js`).
 */

const RAYON_TERRE_M = 6_371_008.8;
const rad = (degres) => (degres * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

/** Distance à vol d'oiseau entre deux points, en mètres (formule de haversine). */
export function distanceM([latA, lonA], [latB, lonB]) {
  const dLat = rad(latB - latA);
  const dLon = rad(lonB - lonA);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur totale d'un tracé, en mètres. */
export function longueurM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceM(points[i - 1], points[i]);
  return total;
}

/** Point situé à `fraction` (0 à 1) du chemin le plus court entre a et b, sur le grand cercle. */
export function interpoler(a, b, fraction) {
  const [lat1, lon1] = [rad(a[0]), rad(a[1])];
  const [lat2, lon2] = [rad(b[0]), rad(b[1])];
  const d = distanceM(a, b) / RAYON_TERRE_M;
  if (d === 0) return [a[0], a[1]];

  const k1 = Math.sin((1 - fraction) * d) / Math.sin(d);
  const k2 = Math.sin(fraction * d) / Math.sin(d);
  const x = k1 * Math.cos(lat1) * Math.cos(lon1) + k2 * Math.cos(lat2) * Math.cos(lon2);
  const y = k1 * Math.cos(lat1) * Math.sin(lon1) + k2 * Math.cos(lat2) * Math.sin(lon2);
  const z = k1 * Math.sin(lat1) + k2 * Math.sin(lat2);
  return [deg(Math.atan2(z, Math.sqrt(x * x + y * y))), deg(Math.atan2(y, x))];
}

/**
 * Ligne directe entre deux points, découpée en segments le long du grand cercle.
 * Sert quand aucune route n'existe (autre continent, île) : la ligne reste courbe à
 * l'écran et le marqueur de position reste dessus.
 */
export function arcDirect(a, b, segments = 64) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) points.push(interpoler(a, b, i / segments));
  return points;
}

/** Distance (m) du point p au segment [a, b], dans une projection plane locale. */
function distanceAuSegmentM(p, a, b) {
  const latRef = rad((a[0] + b[0] + p[0]) / 3);
  const versXY = ([lat, lon]) => [rad(lon) * Math.cos(latRef) * RAYON_TERRE_M, rad(lat) * RAYON_TERRE_M];
  const [px, py] = versXY(p);
  const [ax, ay] = versXY(a);
  const [bx, by] = versXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const longueur2 = dx * dx + dy * dy;
  const t = longueur2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / longueur2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Simplification de Douglas-Peucker : retire les points qui s'écartent de moins de
 * `toleranceM` mètres de la ligne qui les entoure. Pile explicite plutôt que récursion :
 * un tracé de plusieurs milliers de points dépasserait la pile d'appels.
 */
export function simplifierTrace(points, toleranceM = 50) {
  if (!Array.isArray(points) || points.length <= 2) return points ? [...points] : [];

  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];

  while (pile.length > 0) {
    const [debut, fin] = pile.pop();
    let ecartMax = 0;
    let indexMax = -1;
    for (let i = debut + 1; i < fin; i += 1) {
      const ecart = distanceAuSegmentM(points[i], points[debut], points[fin]);
      if (ecart > ecartMax) {
        ecartMax = ecart;
        indexMax = i;
      }
    }
    if (indexMax !== -1 && ecartMax > toleranceM) {
      garder[indexMax] = 1;
      pile.push([debut, indexMax], [indexMax, fin]);
    }
  }

  return points.filter((_, i) => garder[i] === 1);
}

/** Arrondit chaque coordonnée : 5 décimales ≈ 1 mètre, au-delà on stocke du bruit. */
export function arrondirTrace(points, decimales = 5) {
  const facteur = 10 ** decimales;
  return points.map(([lat, lon]) => [Math.round(lat * facteur) / facteur, Math.round(lon * facteur) / facteur]);
}
