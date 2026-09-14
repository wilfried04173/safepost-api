import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/ApiError.js';
import { sendMail } from '../../shared/mailer.js';
import { Admin } from './admin.model.js';

/** Chaîne aléatoire lisible, largement au-dessus du minimum de 8 caractères du modèle. */
function generatePassword() {
  return crypto.randomBytes(12).toString('base64url'); // ~16 caractères, alphanumérique + -_
}

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

/**
 * Un seul compte admin existe : pas besoin de demander un email, ni de
 * révéler si un compte correspond ou non. Génère un nouveau mot de passe et
 * l'envoie à l'adresse fixe configurée - jamais à l'email du compte, pour ne
 * pas dépendre de sa justesse ni exposer ce canal à qui a juste trouvé la
 * page de connexion.
 *
 * L'email part AVANT l'enregistrement en base : si l'envoi échoue (SMTP mal
 * configuré, par exemple), le mot de passe actuel reste valide plutôt que de
 * verrouiller le compte sur un mot de passe que personne n'a reçu.
 */
export async function forgotPassword() {
  const admin = await Admin.findOne();
  if (!admin) throw ApiError.notFound("Aucun compte administrateur n'existe");

  const newPassword = generatePassword();

  await sendMail({
    to: env.passwordResetEmail,
    subject: 'SafePoste - Nouveau mot de passe administrateur',
    text: [
      'Bonjour,',
      '',
      `Un nouveau mot de passe a été généré pour le compte administrateur SafePoste (${admin.email}), suite à un clic sur "Mot de passe oublié" sur la page de connexion.`,
      '',
      `Nouveau mot de passe : ${newPassword}`,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, connectez-vous et changez ce mot de passe dès que possible.",
      '',
      '- SafePoste',
    ].join('\n'),
  });

  // L'email est parti avec succès : seulement maintenant on remplace le mot
  // de passe (haché par le hook pre('save') du modèle).
  admin.password = newPassword;
  await admin.save();
}
