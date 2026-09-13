/** Enveloppe un handler asynchrone pour que les promesses rejetées atteignent le middleware d'erreur. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
