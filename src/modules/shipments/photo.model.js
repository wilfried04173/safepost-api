import mongoose from 'mongoose';

/**
 * Contenu binaire d'une photo de colis.
 *
 * Volontairement dans sa propre collection : une expédition ne garde que de
 * minuscules métadonnées (`shipment.photos`). Charger la liste des expéditions
 * ne ramène donc jamais les images, et une photo de quelques centaines de ko ne
 * s'approche pas de la limite de 16 Mo d'un document MongoDB.
 *
 * `_id` est le même que celui de l'entrée `shipment.photos` correspondante, ce
 * qui sert aussi d'identifiant dans l'URL publique.
 */
const parcelPhotoSchema = new mongoose.Schema(
  {
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, index: true },
    // Redondant avec `shipment`, mais permet de servir une photo publique avec
    // une seule requête, à partir de ce que le visiteur connaît (son numéro de suivi).
    trackingId: { type: String, required: true, index: true },
    contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

export const ParcelPhoto = mongoose.model('ParcelPhoto', parcelPhotoSchema);
