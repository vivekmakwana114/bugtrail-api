/* eslint-disable no-console */
/**
 * npm run seed
 *
 * Idempotent: creates the default roles that are missing and the first Admin
 * (from SEED_ADMIN_* in .env) if no user has that email yet. Safe to re-run.
 */
import mongoose from 'mongoose';
import config from '../config/config.js';
import { User } from '../models/index.js';
import { roleService } from '../services/index.js';
import { ADMIN_ROLE_SLUG } from '../config/defaultRoles.js';
import { userStatuses } from '../config/userStatuses.js';

const seedAdmin = async (adminRole) => {
  const { name, email, password } = config.seedAdmin;
  if (!name || !email || !password) {
    console.warn('SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipped the Admin user.');
    return;
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Admin user ${email} already exists: left unchanged.`);
    return;
  }
  await User.create({ name, email, password, role: adminRole._id, status: userStatuses.ACTIVE });
  console.log(`Created Admin user ${email}. Change the password after first login.`);
};

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    const roles = await roleService.ensureDefaultRoles();
    console.log(`Roles ready: ${roles.map((role) => role.name).join(', ')}`);
    await seedAdmin(roles.find((role) => role.slug === ADMIN_ROLE_SLUG));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
});
