import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Adresse email invalide'],
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est requis'],
      minlength: [8, 'Le mot de passe doit comporter au moins 8 caractères'],
      select: false, // jamais renvoyé, sauf demande explicite
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

/** Hache le mot de passe à la création et à chaque modification. */
adminSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  return next();
});

adminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

adminSchema.methods.toPublicJSON = function toPublicJSON() {
  return { id: this._id.toString(), name: this.name, email: this.email };
};

export const Admin = mongoose.model('Admin', adminSchema);
