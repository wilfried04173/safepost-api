import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Une adresse email valide est requise'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});
