import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arcDirect,
  arrondirTrace,
  distanceM,
  interpoler,
  longueurM,
  simplifierTrace,
} from '../src/shared/domaine/geometrie.js';

const PARIS = [48.8566, 2.3522];
const LYON = [45.764, 4.8357];

test('distanceM : Paris - Lyon à vol d\'oiseau ≈ 392 km', () => {
  const km = distanceM(PARIS, LYON) / 1000;
  assert.ok(km > 385 && km < 400, `${km} km`);
});

test('inverser latitude et longitude déplace le point de milliers de km (garde-fou [lat, lon])', () => {
  const inverse = [PARIS[1], PARIS[0]];
  assert.ok(distanceM(PARIS, inverse) > 4_000_000);
});

test('interpoler : extrémités exactes et milieu à mi-distance', () => {
  assert.deepEqual(interpoler(PARIS, LYON, 0).map((v) => v.toFixed(6)), PARIS.map((v) => v.toFixed(6)));
  const milieu = interpoler(PARIS, LYON, 0.5);
  const total = distanceM(PARIS, LYON);
  assert.ok(Math.abs(distanceM(PARIS, milieu) - total / 2) < 1);
});

test('simplifierTrace : retire les points alignés, garde les extrémités et les virages', () => {
  const ligne = Array.from({ length: 1001 }, (_, i) => [45 + i * 0.001, 4]);
  assert.deepEqual(simplifierTrace(ligne, 50), [ligne[0], ligne[1000]]);

  const virage = [[45, 4], [45.5, 4], [45.5, 4.5]];
  assert.equal(simplifierTrace(virage, 50).length, 3);
});

test('simplifierTrace : un tracé sinueux garde sa longueur à moins de 1 % près', () => {
  const sinueux = Array.from({ length: 5000 }, (_, i) => [45 + i * 0.0005, 4 + 0.01 * Math.sin(i / 40)]);
  const simplifie = simplifierTrace(sinueux, 50);
  assert.ok(simplifie.length < sinueux.length / 5, `${simplifie.length} points`);
  const ecart = Math.abs(longueurM(simplifie) - longueurM(sinueux)) / longueurM(sinueux);
  assert.ok(ecart < 0.01, `écart ${(ecart * 100).toFixed(2)} %`);
});

test('arrondirTrace : 5 décimales', () => {
  assert.deepEqual(arrondirTrace([[48.856612345, 2.352212345]]), [[48.85661, 2.35221]]);
});

test('arcDirect : 65 points, du départ à l\'arrivée', () => {
  const arc = arcDirect(PARIS, LYON);
  assert.equal(arc.length, 65);
  assert.ok(distanceM(arc.at(-1), LYON) < 1);
});
