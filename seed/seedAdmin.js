/**
 * Crée (ou met à jour) l'unique compte admin de l'agence à partir des variables
 * SEED_ADMIN_*.
 * Lancer avec : npm run seed:admin
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Admin } from '../src/modules/auth/admin.model.js';

async function run() {
  const { email, password, name } = env.seedAdmin;

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  await connectDatabase();

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.name = name;
    existing.password = password; // re-haché par le hook pre-save
    await existing.save();
    console.log(`[seed] admin updated: ${existing.email}`);
  } else {
    const admin = await Admin.create({ name, email, password });
    console.log(`[seed] admin created: ${admin.email}`);
  }

  await disconnectDatabase();
  process.exit(0);
}

run().catch((error) => {
  console.error('[seed] failed:', error.message);
  process.exit(1);
});
