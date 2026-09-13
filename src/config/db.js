import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[db] connected to ${mongoose.connection.name}`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
