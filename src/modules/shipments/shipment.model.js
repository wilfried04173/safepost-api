import mongoose from 'mongoose';
import { calculerProgression } from '../../shared/domaine/progression.js';
import { ALL_STATUSES, SERVICE_TYPES } from './shipment.constants.js';

const partySchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const parcelSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    contentType: { type: String, trim: true },
    weightKg: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    lengthCm: { type: Number, min: 0 },
    widthCm: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 },
    declaredValue: { type: Number, min: 0 },
    currency: { type: String, default: 'USD', trim: true, uppercase: true },
  },
  { _id: false },
);

/**
 * Les cinq seuls champs qui pilotent la progression.
 *
 * Rien d'autre n'est stocké : ni pourcentage, ni étape courante. Tout est
 * recalculé à la lecture par `src/shared/domaine/progression.js`, ce qui supprime
 * le besoin d'un processus de fond chargé de tenir la barre à jour.
 */
const progressionSchema = new mongoose.Schema(
  {
    demarreLe: { type: Date },
    arriveePrevueLe: { type: Date },
    enPause: { type: Boolean, default: false },
    pauseeLe: { type: Date },
    cumulPauseMs: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/** Trace d'une action de l'agence (mise en pause, reprise, livraison, annulation). */
const eventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ALL_STATUSES, required: true },
    location: { type: String, trim: true },
    note: { type: String, trim: true },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const shipmentSchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    service: { type: String, enum: SERVICE_TYPES, default: 'standard' },
    sender: { type: partySchema, required: true },
    recipient: { type: partySchema, required: true },
    parcel: { type: parcelSchema, required: true },

    progression: { type: progressionSchema, default: () => ({}) },

    // Les deux seuls états que l'agence consigne à la main : une livraison se
    // constate, elle ne se chronomètre pas ; une annulation non plus.
    deliveredAt: { type: Date },
    cancelledAt: { type: Date },

    internalNotes: { type: String, trim: true },
    events: { type: [eventSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ 'recipient.fullName': 'text', 'sender.fullName': 'text' });

/** Progression recalculée à l'instant de l'appel. */
shipmentSchema.methods.progressionActuelle = function progressionActuelle(maintenant = Date.now()) {
  return calculerProgression(
    this.progression?.toObject?.() ?? this.progression ?? {},
    { livreLe: this.deliveredAt, annuleLe: this.cancelledAt },
    maintenant,
  );
};

/** Statut dérivé — il n'existe nulle part en base. */
shipmentSchema.virtual('status').get(function status() {
  return this.progressionActuelle().etape;
});

/**
 * Ce que l'agence voit : tout, plus la progression déjà calculée.
 * `toJSON`/`toObject` incluent les virtuels pour que `status` sorte de l'API.
 */
shipmentSchema.set('toJSON', { virtuals: true });
shipmentSchema.set('toObject', { virtuals: true });

/** Tout ce qu'un visiteur a le droit de voir sur la page de suivi publique. */
shipmentSchema.methods.toPublicJSON = function toPublicJSON() {
  // Les coordonnées (email, téléphone) et la valeur déclarée ne sortent jamais en public.
  const maskParty = (party) => ({
    fullName: party.fullName,
    addressLine: party.addressLine,
    postalCode: party.postalCode,
    city: party.city,
    country: party.country,
  });

  const progression = this.progressionActuelle();

  return {
    trackingId: this.trackingId,
    service: this.service,
    status: progression.etape,
    progression: {
      // Le navigateur rejoue le même calcul chaque seconde : il lui faut les
      // horodatages bruts, pas seulement le pourcentage figé de cette réponse.
      demarreLe: this.progression?.demarreLe,
      arriveePrevueLe: this.progression?.arriveePrevueLe,
      enPause: this.progression?.enPause ?? false,
      pauseeLe: this.progression?.pauseeLe,
      cumulPauseMs: this.progression?.cumulPauseMs ?? 0,
      pourcentage: progression.pourcentage,
    },
    sender: maskParty(this.sender),
    recipient: maskParty(this.recipient),
    parcel: {
      description: this.parcel.description,
      contentType: this.parcel.contentType,
      weightKg: this.parcel.weightKg,
      quantity: this.parcel.quantity,
      lengthCm: this.parcel.lengthCm,
      widthCm: this.parcel.widthCm,
      heightCm: this.parcel.heightCm,
    },
    estimatedDeliveryDate: this.progression?.arriveePrevueLe,
    deliveredAt: this.deliveredAt,
    cancelledAt: this.cancelledAt,
    createdAt: this.createdAt,
    events: this.events
      .slice()
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .map((event) => ({
        status: event.status,
        location: event.location,
        note: event.note,
        occurredAt: event.occurredAt,
      })),
  };
};

export const Shipment = mongoose.model('Shipment', shipmentSchema);
