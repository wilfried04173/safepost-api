import { z } from 'zod';
import { ALL_STATUSES } from './shipment.constants.js';

// Les formulaires envoient une chaîne vide pour les champs non remplis :
// on les supprime plutôt que de stocker "" en base.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.toLowerCase() : undefined))
  .refine((value) => value === undefined || /^\S+@\S+\.\S+$/.test(value), {
    message: 'Adresse email invalide',
  });

// Aucune coordonnée : Google Maps calcule l'itinéraire depuis les adresses.
const party = z.object({
  fullName: z.string().trim().min(2, 'Le nom complet est requis'),
  email: optionalEmail,
  phone: optionalString,
  addressLine: z.string().trim().min(3, "L'adresse est requise"),
  city: z.string().trim().min(1, 'La ville est requise'),
  postalCode: optionalString,
  country: z.string().trim().min(2, 'Le pays est requis'),
});

const parcel = z.object({
  description: z.string().trim().min(2, 'La description est requise'),
  contentType: optionalString,
  weightKg: z.coerce.number().min(0, 'Le poids ne peut pas être négatif'),
  quantity: z.coerce.number().int().min(1).default(1),
  lengthCm: z.coerce.number().min(0).optional(),
  widthCm: z.coerce.number().min(0).optional(),
  heightCm: z.coerce.number().min(0).optional(),
  declaredValue: z.coerce.number().min(0).optional(),
  currency: z.string().trim().toUpperCase().default('USD'),
});

/**
 * Création : ni service ni statut initial ne sont demandés.
 * Le service est « standard » par défaut et le statut se déduit des deux dates.
 */
export const createShipmentSchema = z
  .object({
    sender: party,
    recipient: party,
    parcel,
    demarreLe: z.coerce.date().optional(),
    arriveePrevueLe: z.coerce.date(),
    internalNotes: optionalString,
  })
  .refine((value) => !value.demarreLe || value.arriveePrevueLe > value.demarreLe, {
    message: "L'arrivée prévue doit être postérieure au départ",
    path: ['arriveePrevueLe'],
  });

/** Correction des deux dates qui pilotent la progression. */
export const scheduleSchema = z.object({
  demarreLe: z.coerce.date().optional(),
  arriveePrevueLe: z.coerce.date().optional(),
});

/** Note libre accompagnant une action de l'agence (pause, reprise, livraison...). */
export const agencyActionSchema = z.object({
  note: optionalString,
});

export const listShipmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ALL_STATUSES).optional(),
  search: optionalString,
});

export const trackingIdSchema = z.object({
  trackingId: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, 'Un numéro de suivi comporte au moins 6 caractères')
    .max(30),
});
