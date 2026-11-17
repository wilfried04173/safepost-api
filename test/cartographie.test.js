import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

// env.js exige ces variables à l'import ; aucune connexion n'est ouverte ici.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:1/test';
process.env.JWT_SECRET ||= 'test';

const { adresseModifiee, calculerCarte } = await import('../src/shared/cartographie.js');

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Remplace fetch : `nominatim(params)` renvoie un résultat ou null ; `osrm` la réponse OSRM. */
function simuler({ nominatim, osrm }) {
  const appels = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    appels.push(u);
    if (u.hostname === 'nominatim.openstreetmap.org') {
      const resultat = nominatim(Object.fromEntries(u.searchParams));
      return new Response(JSON.stringify(resultat ? [resultat] : []), { status: 200 });
    }
    return new Response(JSON.stringify(osrm), { status: 200 });
  };
  return appels;
}

const lieu = (lat, lon, postcode) => ({ lat: String(lat), lon: String(lon), address: { postcode } });
const osrmOk = {
  code: 'Ok',
  routes: [{ distance: 465123.4, geometry: { coordinates: [[2.35, 48.85], [3.1, 47.9], [4.83, 45.76]] } }],
};

test('adresse complète trouvée : itinéraire routier, coordonnées converties en [lat, lon]', { timeout: 20_000 }, async () => {
  simuler({ nominatim: (p) => (p.city === 'Paris' ? lieu(48.85, 2.35, '75001') : lieu(45.76, 4.83, '69003')), osrm: osrmOk });
  const carte = await calculerCarte(
    { addressLine: '1 rue de Rivoli', postalCode: '75001', city: 'Paris', country: 'France' },
    { addressLine: '3 rue X', postalCode: '69003', city: 'Lyon', country: 'France' },
  );
  assert.equal(carte.mode, 'route');
  assert.equal(carte.distanceM, 465123);
  assert.deepEqual(carte.trace[0], [48.85, 2.35]);
  assert.deepEqual(carte.trace.at(-1), [45.76, 4.83]);
  assert.equal(carte.echec, undefined);
});

test('repli dégradé : un homonyme avec un autre code postal est rejeté (pas de carte fausse)', { timeout: 30_000 }, async () => {
  // L'adresse complète échoue ; les requêtes dégradées tombent sur la mauvaise commune (51260).
  simuler({ nominatim: (p) => (p.street ? null : lieu(48.7, 3.9, '51260')), osrm: osrmOk });
  const carte = await calculerCarte(
    { addressLine: '105 chemin de l’hôtelier', postalCode: '26600', city: 'Chantemerle', country: 'France' },
    { addressLine: 'x', postalCode: '75001', city: 'Paris', country: 'France' },
  );
  assert.match(carte.echec, /expéditeur introuvable/);
  assert.equal(carte.trace, undefined);
});

test('repli dégradé accepté quand le code postal correspond', { timeout: 30_000 }, async () => {
  simuler({ nominatim: (p) => (p.street ? null : lieu(42.7, 9.45, '20600')), osrm: osrmOk });
  const carte = await calculerCarte(
    { addressLine: 'LES VALLONS DU MACCHIONE BAT.12', postalCode: '20600', city: 'Bastia', country: 'France' },
    { addressLine: 'LES VALLONS DU MACCHIONE BAT.12', postalCode: '20600', city: 'Bastia', country: 'France' },
  );
  assert.equal(carte.echec, undefined);
  assert.equal(carte.depart.lat, 42.7);
});

test('pas de route possible : ligne directe le long du grand cercle', { timeout: 20_000 }, async () => {
  simuler({ nominatim: (p) => (p.city === 'Anvers' ? lieu(51.22, 4.4, '2000') : lieu(40.71, -74.0, '10001')), osrm: { code: 'NoRoute' } });
  const carte = await calculerCarte(
    { addressLine: 'a', postalCode: '2000', city: 'Anvers', country: 'Belgique' },
    { addressLine: 'b', postalCode: '10001', city: 'New York', country: 'États-Unis' },
  );
  assert.equal(carte.mode, 'direct');
  assert.equal(carte.trace.length, 65);
  assert.ok(carte.distanceM > 5_000_000);
});

test('extrémité collée loin de la route (hors couverture OSRM) : ligne directe, pas de faux itinéraire', { timeout: 20_000 }, async () => {
  simuler({
    nominatim: (p) => (p.city === 'Anvers' ? lieu(51.22, 4.4, '2000') : lieu(40.75, -73.99, '10118')),
    osrm: {
      code: 'Ok',
      waypoints: [{ distance: 6 }, { distance: 5_529_250 }],
      routes: [{ distance: 2_119_000, geometry: { coordinates: [[4.4, 51.22], [-9.5, 38.78]] } }],
    },
  });
  const carte = await calculerCarte(
    { addressLine: 'a', postalCode: '2000', city: 'Anvers', country: 'Belgique' },
    { addressLine: 'b', postalCode: '10118', city: 'New York', country: 'United States' },
  );
  assert.equal(carte.mode, 'direct');
  assert.ok(Math.abs(carte.trace.at(-1)[0] - 40.75) < 0.01);
});

test('service en panne : aucune exception, la carte porte un échec', { timeout: 20_000 }, async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  const carte = await calculerCarte({ city: 'Paris', country: 'France' }, { city: 'Lyon', country: 'France' });
  assert.match(carte.echec, /indisponible/);
});

test('deux géocodages successifs sont espacés d\'au moins 1,1 s (politique Nominatim)', { timeout: 20_000 }, async () => {
  const horaires = [];
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === 'nominatim.openstreetmap.org') {
      horaires.push(Date.now());
      return new Response(JSON.stringify([lieu(48, 2, '75001')]), { status: 200 });
    }
    return new Response(JSON.stringify(osrmOk), { status: 200 });
  };
  await calculerCarte({ city: 'Paris', country: 'France' }, { city: 'Lyon', country: 'France' });
  assert.equal(horaires.length, 2);
  assert.ok(horaires[1] - horaires[0] >= 1_050, `${horaires[1] - horaires[0]} ms`);
});

test('coupure réseau passagère : une seconde tentative suffit', { timeout: 20_000 }, async () => {
  let premiers = 0;
  globalThis.fetch = async (url) => {
    if (premiers === 0) {
      premiers += 1;
      throw new TypeError('fetch failed');
    }
    if (new URL(url).hostname === 'nominatim.openstreetmap.org') {
      return new Response(JSON.stringify([lieu(48, 2, '75001')]), { status: 200 });
    }
    return new Response(JSON.stringify(osrmOk), { status: 200 });
  };
  const carte = await calculerCarte({ city: 'Paris', country: 'France' }, { city: 'Lyon', country: 'France' });
  assert.equal(carte.echec, undefined);
  assert.equal(carte.mode, 'route');
});

test('adresseModifiee : un changement de nom ne compte pas, un changement de ville oui', () => {
  const avant = { fullName: 'A', addressLine: '1 rue', city: 'Paris', postalCode: '75001', country: 'France' };
  assert.equal(adresseModifiee(avant, { ...avant, fullName: 'B' }), false);
  assert.equal(adresseModifiee(avant, { ...avant, city: 'Lyon' }), true);
  assert.equal(adresseModifiee(avant, undefined), false);
});
