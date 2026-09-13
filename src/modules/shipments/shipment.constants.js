/**
 * Cycle de vie ordonné d'un colis.
 *
 * Quatre étapes seulement, et aucune n'est saisie à la main : les trois
 * premières se déduisent du temps écoulé (voir src/shared/domaine/progression.js),
 * la dernière est consignée par l'agence.
 */
export const SHIPMENT_STATUSES = ['registered', 'in_transit', 'out_for_delivery', 'delivered'];

/** États hors progression : la pause et l'annulation. */
export const EXCEPTION_STATUSES = ['on_hold', 'cancelled'];

export const ALL_STATUSES = [...SHIPMENT_STATUSES, ...EXCEPTION_STATUSES];

export const STATUS_LABELS = {
  registered: 'Colis enregistré',
  in_transit: 'En transit',
  out_for_delivery: 'En cours de livraison',
  delivered: 'Livré',
  on_hold: 'En pause',
  cancelled: 'Annulé',
};

// Les trois offres réelles de l'agence. Les clés internes restent en anglais
// (standard/express/custom) pour ne pas toucher au schéma Mongoose ni à la
// validation ; seuls les libellés affichés changent.
export const SERVICE_TYPES = ['standard', 'express', 'custom'];

export const SERVICE_LABELS = {
  standard: 'Livraison standard',
  express: 'Livraison flash',
  custom: 'Livraison personnalisée (par téléphone)',
};
