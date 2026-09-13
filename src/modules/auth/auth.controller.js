import { asyncHandler } from '../../shared/asyncHandler.js';
import * as authService from './auth.service.js';

export const loginController = asyncHandler(async (req, res) => {
  const { token, admin } = await authService.login(req.body);
  res.json({ success: true, data: { token, admin } });
});

export const meController = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { admin: req.admin.toPublicJSON() } });
});
