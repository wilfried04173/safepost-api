import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route introuvable : ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erreur interne du serveur';
  let details = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation échouée';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Valeur invalide pour « ${err.path} »`;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = `Valeur déjà utilisée pour ${Object.keys(err.keyValue).join(', ')}`;
  }

  if (statusCode >= 500) console.error('[error]', err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}
