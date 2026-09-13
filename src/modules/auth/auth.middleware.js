import { ApiError } from '../../shared/ApiError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { Admin } from './admin.model.js';
import { verifyToken } from './auth.service.js';

/** Rejette la requête sauf si elle porte un jeton admin valide. */
export const requireAdmin = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Authentification requise');

  const payload = verifyToken(token);
  const admin = await Admin.findById(payload.sub);
  if (!admin) throw ApiError.unauthorized("Ce compte n'existe plus");

  req.admin = admin;
  next();
});
