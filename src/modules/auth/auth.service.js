import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/ApiError.js';
import { Admin } from './admin.model.js';

export function signToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), role: 'admin' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Session expirée ou invalide, veuillez vous reconnecter');
  }
}

export async function login({ email, password }) {
  const admin = await Admin.findOne({ email }).select('+password');
  // Même message pour un email inconnu et un mauvais mot de passe : pas d'énumération de comptes.
  if (!admin) throw ApiError.unauthorized('Email ou mot de passe invalide');

  const passwordMatches = await admin.comparePassword(password);
  if (!passwordMatches) throw ApiError.unauthorized('Email ou mot de passe invalide');

  admin.lastLoginAt = new Date();
  await admin.save({ validateBeforeSave: false });

  return { token: signToken(admin), admin: admin.toPublicJSON() };
}
