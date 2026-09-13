import { ApiError } from '../../shared/ApiError.js';
import { Message } from './message.model.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function createMessage(payload) {
  return Message.create(payload);
}

/**
 * Le dashboard affiche des « conversations », pas des messages bruts : tous les
 * messages d'une même adresse email sont repliés en un fil unique, le plus
 * récent en tête.
 */
export async function listThreads({ page, limit, status, search }) {
  const match = {};
  if (status) match.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    match.$or = [{ name: rx }, { email: rx }, { body: rx }, { trackingId: rx }];
  }

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$email',
        email: { $first: '$email' },
        name: { $first: '$name' },
        lastMessage: { $first: '$body' },
        lastMessageAt: { $first: '$createdAt' },
        lastSource: { $first: '$source' },
        trackingId: { $first: '$trackingId' },
        messageCount: { $sum: 1 },
        unreadCount: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
      },
    },
    { $sort: { lastMessageAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  ];

  const [result] = await Message.aggregate(pipeline);
  const total = result?.meta?.[0]?.total || 0;

  return {
    items: (result?.items || []).map(({ _id, ...thread }) => thread),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getThread(email) {
  const normalised = email.toLowerCase().trim();
  const messages = await Message.find({ email: normalised }).sort({ createdAt: 1 });
  if (messages.length === 0) throw ApiError.notFound('Aucune conversation pour cette adresse');

  return {
    email: normalised,
    name: messages[messages.length - 1].name,
    messages,
  };
}

/** Appelé quand l'admin ouvre une conversation. */
export async function markThreadRead(email) {
  const normalised = email.toLowerCase().trim();
  await Message.updateMany({ email: normalised, status: 'new' }, { $set: { status: 'read' } });
  return getThread(normalised);
}

export async function markThreadReplied(email) {
  const normalised = email.toLowerCase().trim();
  await Message.updateMany(
    { email: normalised },
    { $set: { status: 'replied', repliedAt: new Date() } },
  );
  return getThread(normalised);
}

export async function updateMessageStatus(id, status) {
  const message = await Message.findByIdAndUpdate(
    id,
    { status, ...(status === 'replied' ? { repliedAt: new Date() } : {}) },
    { new: true },
  );
  if (!message) throw ApiError.notFound('Message introuvable');
  return message;
}

export async function deleteMessage(id) {
  const deleted = await Message.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Message introuvable');
  return deleted;
}

export async function deleteThread(email) {
  const { deletedCount } = await Message.deleteMany({ email: email.toLowerCase().trim() });
  if (!deletedCount) throw ApiError.notFound('Aucune conversation pour cette adresse');
  return deletedCount;
}

export async function getMessageStats() {
  const [total, unread, threads] = await Promise.all([
    Message.countDocuments(),
    Message.countDocuments({ status: 'new' }),
    Message.distinct('email'),
  ]);
  return { total, unread, threads: threads.length };
}
