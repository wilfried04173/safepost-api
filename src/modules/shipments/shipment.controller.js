import { asyncHandler } from '../../shared/asyncHandler.js';
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

/** Corrige la date de départ et/ou l'arrivée prévue. */
export const updateScheduleController = asyncHandler(async (req, res) => {
  const shipment = await service.updateSchedule(req.params.id, req.body);
  res.json({ success: true, data: shipment });
});

export const pauseController = asyncHandler(async (req, res) => {
  const shipment = await service.pauseShipment(req.params.id, req.body.note);
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

/** Endpoint public : ne renvoie que la projection masquée, sans donnée sensible. */
export const trackController = asyncHandler(async (req, res) => {
  const shipment = await service.getShipmentByTrackingId(req.params.trackingId);
  res.json({ success: true, data: shipment.toPublicJSON() });
});
