import { ApiError } from '../../shared/ApiError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { Admin } from './admin.model.js';
import { AUTH_COOKIE, verifyToken } from './auth.service.js';

/** Rejette la requête sauf si elle porte un jeton admin valide, lu depuis le cookie HttpOnly. */
export const requireAdmin = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw ApiError.unauthorized('Authentification requise');

  const payload = verifyToken(token);
  const admin = await Admin.findById(payload.sub);
  if (!admin) throw ApiError.unauthorized("Ce compte n'existe plus");

  req.admin = admin;
  next();
});
