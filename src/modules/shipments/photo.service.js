import mongoose from 'mongoose';
import { ApiError } from '../../shared/ApiError.js';
import { ParcelPhoto } from './photo.model.js';
import { getShipmentById } from './shipment.service.js';

/** Nombre maximal de photos par expédition. */
export const MAX_PHOTOS = 2;

/** Poids maximal d'une photo reçue (le navigateur la réduit bien en dessous avant l'envoi). */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/**
 * Reconnaît le format réel d'après les premiers octets du fichier, pas d'après
 * l'en-tête `Content-Type` : celui-ci est déclaré par l'appelant, donc librement
 * falsifiable. Renvoie `null` si ce n'est ni un JPEG, ni un PNG, ni un WebP.
 */
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => buffer[i] === byte)) return 'image/png';

  // WebP : « RIFF » + taille sur 4 octets + « WEBP »
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

/** Une expédition livrée ou annulée est close : on ne touche plus à ses photos. */
function assertOuverte(shipment) {
  if (shipment.deliveredAt) throw ApiError.badRequest('Ce colis est déjà livré : ses photos ne peuvent plus être modifiées');
  if (shipment.cancelledAt) throw ApiError.badRequest('Ce colis est annulé : ses photos ne peuvent plus être modifiées');
}

/** Ajoute une photo à une expédition (2 au maximum). */
export async function addPhoto(shipmentId, buffer) {
  const contentType = detectImageType(buffer);
  if (!contentType) {
    throw ApiError.badRequest('Fichier non reconnu : envoyez une image JPEG, PNG ou WebP.');
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new ApiError(413, `Cette photo est trop lourde (${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} Mo maximum).`);
  }

  const shipment = await getShipmentById(shipmentId);
  assertOuverte(shipment);
  if (shipment.photos.length >= MAX_PHOTOS) {
    throw ApiError.badRequest(`Une expédition ne peut pas avoir plus de ${MAX_PHOTOS} photos.`);
  }

  const photo = await ParcelPhoto.create({
    shipment: shipment._id,
    trackingId: shipment.trackingId,
    contentType,
    data: buffer,
  });

  try {
    shipment.photos.push({ _id: photo._id, contentType, size: buffer.length });
    await shipment.save();
  } catch (error) {
    // Évite une image orpheline que plus rien ne référence.
    await ParcelPhoto.findByIdAndDelete(photo._id);
    throw error;
  }

  return shipment;
}

/** Retire une photo d'une expédition. */
export async function removePhoto(shipmentId, photoId) {
  const shipment = await getShipmentById(shipmentId);
  assertOuverte(shipment);

  const entry = shipment.photos.id(photoId);
  if (!entry) throw ApiError.notFound('Photo introuvable');

  entry.deleteOne();
  await shipment.save();
  await ParcelPhoto.findByIdAndDelete(photoId);

  return shipment;
}

/**
 * Photo servie publiquement : il faut connaître à la fois le numéro de suivi et
 * l'identifiant de la photo, donc on ne peut pas énumérer les images d'autrui.
 */
export async function getPublicPhoto(trackingId, photoId) {
  if (!mongoose.isValidObjectId(photoId)) throw ApiError.notFound('Photo introuvable');

  const photo = await ParcelPhoto.findOne({ _id: photoId, trackingId: trackingId.toUpperCase() });
  if (!photo) throw ApiError.notFound('Photo introuvable');
  return photo;
}
