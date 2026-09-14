import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

let transporter = null;

/** Construit le transporteur SMTP une seule fois, à la première utilisation. */
function getTransporter() {
  if (transporter) return transporter;

  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    throw ApiError.internal(
      "L'envoi d'email n'est pas configuré (SMTP_HOST/SMTP_USER/SMTP_PASS manquants).",
    );
  }

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465, // 465 = TLS implicite, 587 = STARTTLS
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });

  return transporter;
}

/** Envoie un email texte simple. Lève une ApiError explicite si le SMTP n'est pas configuré. */
export async function sendMail({ to, subject, text }) {
  await getTransporter().sendMail({ from: env.smtp.from, to, subject, text });
}
