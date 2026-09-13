import { asyncHandler } from '../../shared/asyncHandler.js';
import * as service from './message.service.js';

export const createMessageController = asyncHandler(async (req, res) => {
  const message = await service.createMessage(req.body);
  res.status(201).json({
    success: true,
    message: 'Merci ! Notre équipe vous répondra rapidement par email.',
    data: { id: message._id, createdAt: message.createdAt },
  });
});

export const listThreadsController = asyncHandler(async (req, res) => {
  const result = await service.listThreads(req.query);
  res.json({ success: true, data: result });
});

export const getThreadController = asyncHandler(async (req, res) => {
  const thread = await service.markThreadRead(req.params.email);
  res.json({ success: true, data: thread });
});

export const markThreadRepliedController = asyncHandler(async (req, res) => {
  const thread = await service.markThreadReplied(req.params.email);
  res.json({ success: true, data: thread });
});

export const deleteThreadController = asyncHandler(async (req, res) => {
  await service.deleteThread(req.params.email);
  res.json({ success: true, message: 'Conversation supprimée' });
});

export const updateMessageStatusController = asyncHandler(async (req, res) => {
  const message = await service.updateMessageStatus(req.params.id, req.body.status);
  res.json({ success: true, data: message });
});

export const deleteMessageController = asyncHandler(async (req, res) => {
  await service.deleteMessage(req.params.id);
  res.json({ success: true, message: 'Message supprimé' });
});

export const messageStatsController = asyncHandler(async (_req, res) => {
  const stats = await service.getMessageStats();
  res.json({ success: true, data: stats });
});
