import mongoose from 'mongoose';

export const MESSAGE_SOURCES = ['chat', 'contact'];
export const MESSAGE_STATUSES = ['new', 'read', 'replied'];

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Le nom est requis'], trim: true },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Adresse email invalide'],
    },
    subject: { type: String, trim: true },
    body: { type: String, required: [true, 'Le message est requis'], trim: true, maxlength: 5000 },
    trackingId: { type: String, trim: true, uppercase: true },
    source: { type: String, enum: MESSAGE_SOURCES, default: 'chat' },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'new', index: true },
    pageUrl: { type: String, trim: true },
    repliedAt: { type: Date },
  },
  { timestamps: true },
);

messageSchema.index({ createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
