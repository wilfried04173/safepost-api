import express, { Router } from 'express';
import { validate } from '../../shared/validate.js';
import { requireAdmin } from '../auth/auth.middleware.js';
import { MAX_PHOTO_BYTES } from './photo.service.js';
import {
  addPhotoController,
  cancelController,
  createShipmentController,
  deleteShipmentController,
  deliverController,
  getShipmentController,
  listShipmentsController,
  pauseController,
  publicPhotoController,
  removePhotoController,
  resumeController,
  statsController,
  trackController,
  updateScheduleController,
  updateShipmentController,
} from './shipment.controller.js';
import {
  agencyActionSchema,
  createShipmentSchema,
  listShipmentsSchema,
  pauseShipmentSchema,
  publicPhotoParamsSchema,
  scheduleSchema,
  trackingIdSchema,
  updateShipmentSchema,
} from './shipment.validation.js';

/** Ouvert aux visiteurs : GET /api/tracking/:trackingId */
export const trackingRouter = Router();
trackingRouter.get('/:trackingId', validate(trackingIdSchema, 'params'), trackController);
/** Image d'une photo de colis : GET /api/tracking/:trackingId/photos/:photoId */
trackingRouter.get(
  '/:trackingId/photos/:photoId',
  validate(publicPhotoParamsSchema, 'params'),
  publicPhotoController,
);

/** Réservé à l'agence : /api/shipments/* */
export const shipmentRouter = Router();
shipmentRouter.use(requireAdmin);

shipmentRouter.get('/stats', statsController);
shipmentRouter
  .route('/')
  .get(validate(listShipmentsSchema, 'query'), listShipmentsController)
  .post(validate(createShipmentSchema), createShipmentController);
shipmentRouter
  .route('/:id')
  .get(getShipmentController)
  .patch(validate(updateShipmentSchema), updateShipmentController)
  .delete(deleteShipmentController);

// Photos du colis (2 au maximum). Le corps est l'image brute : on n'accepte que les
// trois formats courants, et la taille est plafonnée avant même de lire le fichier.
const rawImage = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: MAX_PHOTO_BYTES,
});
shipmentRouter.post('/:id/photos', rawImage, addPhotoController);
shipmentRouter.delete('/:id/photos/:photoId', removePhotoController);

// Les quatre seules actions manuelles : le reste de la progression suit l'horloge.
shipmentRouter.patch('/:id/schedule', validate(scheduleSchema), updateScheduleController);
shipmentRouter.post('/:id/pause', validate(pauseShipmentSchema), pauseController);
shipmentRouter.post('/:id/resume', validate(agencyActionSchema), resumeController);
shipmentRouter.post('/:id/deliver', validate(agencyActionSchema), deliverController);
shipmentRouter.post('/:id/cancel', validate(agencyActionSchema), cancelController);
