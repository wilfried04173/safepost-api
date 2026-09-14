import { asyncHandler } from '../../shared/asyncHandler.js';
import * as authService from './auth.service.js';

export const loginController = asyncHandler(async (req, res) => {
  const { token, admin } = await authService.login(req.body);
  res.json({ success: true, data: { token, admin } });
});

export const meController = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { admin: req.admin.toPublicJSON() } });
});

export const forgotPasswordController = asyncHandler(async (_req, res) => {
  await authService.forgotPassword();
  res.json({
    success: true,
    message: 'Un nouveau mot de passe a été généré et envoyé par email.',
  });
});
