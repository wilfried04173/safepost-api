import { z } from 'zod';
import { MESSAGE_SOURCES, MESSAGE_STATUSES } from './message.model.js';

// Les formulaires envoient une chaîne vide pour les champs non remplis :
// on les supprime plutôt que de stocker "" en base.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createMessageSchema = z.object({
  name: z.string().trim().min(2, 'Merci de préciser votre nom'),
  email: z.string().trim().toLowerCase().email('Merci de saisir une adresse email valide'),
  subject: optionalString,
  body: z.string().trim().min(2, 'Merci de rédiger votre message').max(5000),
  trackingId: optionalString.transform((value) => value?.toUpperCase()),
  source: z.enum(MESSAGE_SOURCES).default('chat'),
  pageUrl: optionalString,
});

export const listThreadsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MESSAGE_STATUSES).optional(),
  search: optionalString,
});

export const updateStatusSchema = z.object({
  status: z.enum(MESSAGE_STATUSES),
});
