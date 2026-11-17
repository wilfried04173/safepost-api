/**
 * Calcule la carte (OpenStreetMap) des expéditions qui n'en ont pas encore : celles
 * créées avant le passage à OpenStreetMap, et celles dont le calcul a échoué.
 *
 *   npm run maps:backfill -- --essai   affiche ce qui serait fait, sans rien écrire
 *   npm run maps:backfill              calcule et enregistre
 *
 * Compter environ 3 secondes par expédition : c'est la limite de débit de Nominatim
 * (1 requête par seconde), et c'est voulu. Relancer le script reprend automatiquement
 * les échecs, puisqu'il ne traite que les expéditions sans tracé.
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { Shipment } from '../src/modules/shipments/shipment.model.js';
import { calculerCarte } from '../src/shared/cartographie.js';

const essai = process.argv.includes('--essai');

async function run() {
  await connectDatabase();

  const expeditions = await Shipment.find({ 'carte.trace.1': { $exists: false } }).sort({ createdAt: 1 });
  console.log(`[cartes] ${expeditions.length} expédition(s) sans carte${essai ? ' (mode essai : rien ne sera écrit)' : ''}`);

  let reussies = 0;
  for (const expedition of expeditions) {
    const carte = await calculerCarte(expedition.sender, expedition.recipient);
    const resume = carte.echec
      ? `ÉCHEC - ${carte.echec}`
      : `${carte.mode}, ${Math.round(carte.distanceM / 1000)} km, ${carte.trace.length} points`;
    console.log(`  ${expedition.trackingId} : ${expedition.sender.city} → ${expedition.recipient.city} : ${resume}`);

    if (!carte.echec) reussies += 1;
    if (!essai) {
      expedition.carte = carte;
      await expedition.save();
    }
  }

  console.log(`[cartes] terminé : ${reussies}/${expeditions.length} calculée(s)${essai ? ' (non enregistrées)' : ''}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[cartes] échec :', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
