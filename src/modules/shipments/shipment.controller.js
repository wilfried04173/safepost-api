import { asyncHandler } from '../../shared/asyncHandler.js';
import { ApiError } from '../../shared/ApiError.js';
import * as photos from './photo.service.js';
import * as service from './shipment.service.js';

export const createShipmentController = asyncHandler(async (req, res) => {
  const shipment = await service.createShipment(req.body, req.admin._id);
  res.status(201).json({ success: true, data: shipment });
});

export const listShipmentsController = asyncHandler(async (req, res) => {
  const result = await service.listShipments(req.query);
  res.json({ success: true, data: result });
});

export const getShipmentController = asyncHandler(async (req, res) => {
  const shipment = await service.getShipmentById(req.params.id);
  res.json({ success: true, data: shipment });
});

/** Corrige les informations d'une expédition en cours (parties, colis, service, notes). */
export const updateShipmentController = asyncHandler(async (req, res) => {
  const shipment = await service.updateShipment(req.params.id, req.body);
  res.json({ success: true, data: shipment });
});

/** Corrige la date de départ et/ou l'arrivée prévue. */
export const updateScheduleController = asyncHandler(async (req, res) => {
  const shipment = await service.updateSchedule(req.params.id, req.body);
  res.json({ success: true, data: shipment });
});

export const pauseController = asyncHandler(async (req, res) => {
  const shipment = await service.pauseShipment(req.params.id, req.body.reason);
  res.json({ success: true, data: shipment });
});

export const resumeController = asyncHandler(async (req, res) => {
  const shipment = await service.resumeShipment(req.params.id, req.body.note);
  res.json({ success: true, data: shipment });
});

export const deliverController = asyncHandler(async (req, res) => {
  const shipment = await service.markDelivered(req.params.id, req.body.note);
  res.json({ success: true, data: shipment });
});

export const cancelController = asyncHandler(async (req, res) => {
  const shipment = await service.cancelShipment(req.params.id, req.body.note);
  res.json({ success: true, data: shipment });
});

export const deleteShipmentController = asyncHandler(async (req, res) => {
  await service.deleteShipment(req.params.id);
  res.json({ success: true, message: 'Shipment deleted' });
});

export const statsController = asyncHandler(async (_req, res) => {
  const stats = await service.getShipmentStats();
  res.json({ success: true, data: stats });
});

/** Ajoute une photo : le corps de la requête EST l'image (octets bruts, pas du JSON). */
export const addPhotoController = asyncHandler(async (req, res) => {
  // `express.raw` ne remplit le corps que pour les types d'image acceptés ; sinon
  // `req.body` reste un objet vide.
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw ApiError.badRequest('Envoyez une image JPEG, PNG ou WebP.');
  }
  const shipment = await photos.addPhoto(req.params.id, req.body);
  res.status(201).json({ success: true, data: shipment });
});

export const removePhotoController = asyncHandler(async (req, res) => {
  const shipment = await photos.removePhoto(req.params.id, req.params.photoId);
  res.json({ success: true, data: shipment });
});

/**
 * Endpoint public : sert l'image d'une photo de colis.
 *
 * L'identifiant d'une photo ne change jamais (une photo remplacée reçoit un
 * nouvel identifiant), donc le navigateur peut la garder indéfiniment en cache.
 */
export const publicPhotoController = asyncHandler(async (req, res) => {
  const photo = await photos.getPublicPhoto(req.params.trackingId, req.params.photoId);
  res.set({
    'Content-Type': photo.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Helmet interdit par défaut qu'une autre origine charge cette ressource ; or le
    // site (safeposte.com) affiche l'image servie par l'API (api.safeposte.com).
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(photo.data);
});

/** Endpoint public : ne renvoie que la projection masquée, sans donnée sensible. */
export const trackController = asyncHandler(async (req, res) => {
  const shipment = await service.getShipmentByTrackingId(req.params.trackingId);
  res.json({ success: true, data: shipment.toPublicJSON() });
});
