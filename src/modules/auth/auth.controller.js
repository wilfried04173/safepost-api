import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as authService from './auth.service.js';
import { AUTH_COOKIE } from './auth.service.js';

/**
 * `secure` ne s'active qu'en production (HTTPS) - un cookie `secure` est
 * silencieusement ignoré par le navigateur en HTTP local, ce qui casserait le
 * dev. `sameSite: 'lax'` suffit : client et API sont sur le même site
 * (sous-domaines d'un même domaine, ou même hôte en local), donc ce n'est pas
 * une requête cross-site au sens du cookie.
 */
const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  path: '/',
};

export const loginController = asyncHandler(async (req, res) => {
  const { token, admin } = await authService.login(req.body);
  const { exp } = jwt.decode(token);
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: exp * 1000 - Date.now() });
  res.json({ success: true, data: { admin } });
});

export const meController = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { admin: req.admin.toPublicJSON() } });
});

export const logoutController = asyncHandler(async (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.json({ success: true });
});

export const forgotPasswordController = asyncHandler(async (_req, res) => {
  await authService.forgotPassword();
  res.json({
    success: true,
    message: 'Un nouveau mot de passe a été généré et envoyé par email.',
  });
});
