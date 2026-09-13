export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message = 'Requête invalide', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Non autorisé') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Accès interdit') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Ressource introuvable') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflit') {
    return new ApiError(409, message);
  }
}
