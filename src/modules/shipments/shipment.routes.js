import { Router } from 'express';
import { validate } from '../../shared/validate.js';
import { requireAdmin } from '../auth/auth.middleware.js';
import {
  cancelController,
  createShipmentController,
  deleteShipmentController,
  deliverController,
  getShipmentController,
  listShipmentsController,
  pauseController,
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
  scheduleSchema,
  trackingIdSchema,
  updateShipmentSchema,
} from './shipment.validation.js';

/** Ouvert aux visiteurs : GET /api/tracking/:trackingId */
export const trackingRouter = Router();
trackingRouter.get('/:trackingId', validate(trackingIdSchema, 'params'), trackController);

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

// Les quatre seules actions manuelles : le reste de la progression suit l'horloge.
shipmentRouter.patch('/:id/schedule', validate(scheduleSchema), updateScheduleController);
shipmentRouter.post('/:id/pause', validate(agencyActionSchema), pauseController);
shipmentRouter.post('/:id/resume', validate(agencyActionSchema), resumeController);
shipmentRouter.post('/:id/deliver', validate(agencyActionSchema), deliverController);
shipmentRouter.post('/:id/cancel', validate(agencyActionSchema), cancelController);
