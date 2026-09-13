import { ApiError } from './ApiError.js';

/**
 * Express 5 n'expose `req.query` qu'à travers un getter : une affectation simple
 * lève une erreur. Redéfinir la propriété fonctionne uniformément pour toutes les
 * sources (body, query, params).
 */
function replace(req, source, value) {
  Object.defineProperty(req, source, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Fabrique de middleware Express : valide `req[source]` avec un schéma Zod et le
 * remplace par la valeur analysée (convertie et nettoyée).
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return next(ApiError.badRequest('Validation failed', details));
  }

  replace(req, source, result.data);
  return next();
};
