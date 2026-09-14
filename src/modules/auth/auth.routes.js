import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/validate.js';
import { forgotPasswordController, loginController, meController } from './auth.controller.js';
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

// Chaque appel régénère réellement le mot de passe : une limite stricte évite
// qu'un visiteur malveillant ne le change en boucle juste en rechargeant la page.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Trop de demandes, réessayez dans une heure' },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate(loginSchema), loginController);
authRouter.post('/forgot-password', forgotPasswordLimiter, forgotPasswordController);
authRouter.get('/me', requireAdmin, meController);
