import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/validate.js';
import { requireAdmin } from '../auth/auth.middleware.js';
import {
  createMessageController,
  deleteMessageController,
  deleteThreadController,
  getThreadController,
  listThreadsController,
  markThreadRepliedController,
  messageStatsController,
  updateMessageStatusController,
} from './message.controller.js';
import { createMessageSchema, listThreadsSchema, updateStatusSchema } from './message.validation.js';

// Le widget de chat est ouvert à tout internet : on plafonne ce qu'une IP peut envoyer.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Trop de messages envoyés, merci de réessayer plus tard' },
});

/** Ouvert aux visiteurs : POST /api/contact */
export const publicMessageRouter = Router();
publicMessageRouter.post('/', contactLimiter, validate(createMessageSchema), createMessageController);

/** Réservé à l'agence : /api/messages/* */
export const messageRouter = Router();
messageRouter.use(requireAdmin);

messageRouter.get('/stats', messageStatsController);
messageRouter.get('/threads', validate(listThreadsSchema, 'query'), listThreadsController);
messageRouter.route('/threads/:email').get(getThreadController).delete(deleteThreadController);
messageRouter.patch('/threads/:email/replied', markThreadRepliedController);
messageRouter
  .route('/:id')
  .patch(validate(updateStatusSchema), updateMessageStatusController)
  .delete(deleteMessageController);
