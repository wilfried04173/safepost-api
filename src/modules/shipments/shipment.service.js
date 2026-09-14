import { customAlphabet } from 'nanoid';
import { ApiError } from '../../shared/ApiError.js';
import { STATUS_LABELS } from './shipment.constants.js';
import { Shipment } from './shipment.model.js';

/** Échappe la saisie utilisateur pour pouvoir l'utiliser littéralement dans une RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Format imposé : SFP-XXXXXXXXXX-CARGO.
// Uniquement des chiffres au milieu : un numéro de suivi se dicte au téléphone
// et se retape à la main, et un chiffre ne se confond avec aucune lettre.
const generateCode = customAlphabet('0123456789', 10);
const TRACKING_PREFIX = 'SFP';
const TRACKING_SUFFIX = 'CARGO';

/** Génère un numéro de suivi unique, en réessayant en cas de collision (très improbable). */
export async function generateTrackingId(attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = `${TRACKING_PREFIX}-${generateCode()}-${TRACKING_SUFFIX}`;
    const taken = await Shipment.exists({ trackingId: candidate });
    if (!taken) return candidate;
  }
  throw new Error('Impossible de générer un numéro de suivi unique');
}

export async function createShipment(payload, adminId) {
  const trackingId = await generateTrackingId();

  const { demarreLe, arriveePrevueLe, ...rest } = payload;

  const shipment = await Shipment.create({
    ...rest,
    trackingId,
    createdBy: adminId,
    // À la création, seules les deux dates comptent : tout le reste de la
    // progression se déduira d'elles.
    progression: {
      demarreLe: demarreLe || new Date(),
      arriveePrevueLe,
      enPause: false,
      cumulPauseMs: 0,
    },
    events: [
      {
        status: 'registered',
        location: payload.sender.city,
        note: 'Colis enregistré par SafePoste.',
        occurredAt: new Date(),
      },
    ],
  });

  return shipment;
}

/**
 * Liste paginée.
 *
 * Le statut n'existe pas en base — il est dérivé des horodatages — donc le
 * filtre par statut ne peut pas être poussé dans la requête Mongo. On récupère
 * les documents correspondant aux critères stockables, on calcule l'étape de
 * chacun, puis on filtre et on pagine en mémoire. Acceptable au volume d'une
 * agence ; à revoir si le catalogue dépassait quelques dizaines de milliers.
 */
export async function listShipments({ page, limit, status, search }) {
  const filter = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { trackingId: rx },
      { 'sender.fullName': rx },
      { 'recipient.fullName': rx },
      { 'recipient.city': rx },
      { 'sender.city': rx },
    ];
  }

  const documents = await Shipment.find(filter).sort({ createdAt: -1 });

  const enriched = documents.map((document) => {
    const progression = document.progressionActuelle();
    return { document, progression };
  });

  const matching = status
    ? enriched.filter((entry) => entry.progression.etape === status)
    : enriched;

  const total = matching.length;
  const start = (page - 1) * limit;

  const items = matching.slice(start, start + limit).map(({ document, progression }) => ({
    ...document.toObject(),
    status: progression.etape,
    progressionCalculee: progression,
  }));

  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getShipmentById(id) {
  const shipment = await Shipment.findById(id);
  if (!shipment) throw ApiError.notFound('Colis introuvable');
  return shipment;
}

export async function getShipmentByTrackingId(trackingId) {
  const shipment = await Shipment.findOne({ trackingId: trackingId.toUpperCase() });
  if (!shipment) {
    throw ApiError.notFound('Aucun colis ne correspond à ce numéro de suivi. Vérifiez-le et réessayez.');
  }
  return shipment;
}

/** Ajoute une trace datée dans l'historique visible par le client. */
function pushEvent(shipment, status, note) {
  shipment.events.push({
    status,
    note: note || `Statut mis à jour : ${STATUS_LABELS[status] || status}.`,
    occurredAt: new Date(),
  });
}

/** Corrige les deux dates qui pilotent toute la progression. */
export async function updateSchedule(id, { demarreLe, arriveePrevueLe }) {
  const shipment = await getShipmentById(id);

  if (demarreLe) shipment.progression.demarreLe = demarreLe;
  if (arriveePrevueLe) shipment.progression.arriveePrevueLe = arriveePrevueLe;

  await shipment.save();
  return shipment;
}

/**
 * Met la livraison en pause. L'instant est mémorisé : au moment de la reprise,
 * la durée écoulée pendant la pause est ajoutée au cumul et ne compte donc
 * jamais dans la progression.
 */
export async function pauseShipment(id, note) {
  const shipment = await getShipmentById(id);
  if (shipment.deliveredAt) throw ApiError.badRequest('Ce colis est déjà livré');
  if (shipment.progression.enPause) throw ApiError.badRequest('Ce colis est déjà en pause');

  shipment.progression.enPause = true;
  shipment.progression.pauseeLe = new Date();
  pushEvent(shipment, 'on_hold', note || 'Livraison mise en pause par SafePoste.');

  await shipment.save();
  return shipment;
}

export async function resumeShipment(id, note) {
  const shipment = await getShipmentById(id);
  if (!shipment.progression.enPause) throw ApiError.badRequest("Ce colis n'est pas en pause");

  const pausedFor = Date.now() - new Date(shipment.progression.pauseeLe).getTime();
  shipment.progression.cumulPauseMs += Math.max(0, pausedFor);
  shipment.progression.enPause = false;
  shipment.progression.pauseeLe = undefined;

  pushEvent(shipment, shipment.progressionActuelle().etape, note || 'La livraison reprend son cours.');

  await shipment.save();
  return shipment;
}

/** Seule action qui peut allumer l'étape « livrée » : elle se constate. */
export async function markDelivered(id, note) {
  const shipment = await getShipmentById(id);
  if (shipment.deliveredAt) throw ApiError.badRequest('Ce colis est déjà livré');

  shipment.deliveredAt = new Date();
  shipment.progression.enPause = false;
  pushEvent(shipment, 'delivered', note || 'Livré et signé par le destinataire.');

  await shipment.save();
  return shipment;
}

export async function cancelShipment(id, note) {
  const shipment = await getShipmentById(id);
  if (shipment.cancelledAt) throw ApiError.badRequest('Ce colis est déjà annulé');

  shipment.cancelledAt = new Date();
  pushEvent(shipment, 'cancelled', note || 'Expédition annulée par SafePoste.');

  await shipment.save();
  return shipment;
}

export async function deleteShipment(id) {
  const deleted = await Shipment.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Colis introuvable');
  return deleted;
}

/** Compteurs du tableau de bord, calculés à partir des étapes dérivées. */
export async function getShipmentStats() {
  const documents = await Shipment.find({}, 'progression deliveredAt cancelledAt');

  const counts = documents.reduce((acc, document) => {
    const { etape } = document.progressionActuelle();
    acc[etape] = (acc[etape] || 0) + 1;
    return acc;
  }, {});

  return {
    total: documents.length,
    pending: counts.registered || 0,
    inTransit: (counts.in_transit || 0) + (counts.out_for_delivery || 0),
    delivered: counts.delivered || 0,
    onHold: counts.on_hold || 0,
  };
}
