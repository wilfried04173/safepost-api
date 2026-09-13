import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/validate.js';
import { loginController, meController } from './auth.controller.js';
import { requireAdmin } from './auth.middleware.js';
import { loginSchema } from './auth.validation.js';

// Garde anti-force brute sur le seul endpoint d'écriture non authentifié de l'espace admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives de connexion, réessayez dans 15 minutes' },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate(loginSchema), loginController);
authRouter.get('/me', requireAdmin, meController);
