/* eslint-disable no-console, no-await-in-loop */
/**
 * npm run seed: first-run setup. Creates the Admin and nothing else.
 *
 *  - In a terminal it asks for the Admin's email, then the password (hidden, typed twice).
 *  - Without a terminal (Railway, CI, piped input) it reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 *  - If an active Admin already exists it does nothing, so it's safe to run on every deploy.
 *
 * Everyone else registers and is approved by the Admin, who assigns their role there.
 */
import Joi from 'joi';
import mongoose from 'mongoose';
import config from '../config/config.js';
import { User } from '../models/index.js';
import { userService } from '../services/index.js';
import { password as passwordRule } from '../validations/custom.validation.js';
import { roles } from '../config/roles.js';
import { userStatuses } from '../config/userStatuses.js';
import { ask, askHidden } from './prompt.js';

const emailSchema = Joi.string().trim().lowercase().email().required().label('email');
const passwordSchema = Joi.string().required().custom(passwordRule).label('password');

/**
 * @param {Joi.Schema} schema
 * @param {string} value
 * @returns {string|null} error message, or null when valid
 */
const validationError = (schema, value) => schema.validate(value).error?.message ?? null;

const promptEmail = async () => {
  for (;;) {
    const email = (await ask('Admin email: ')).toLowerCase();
    const error = validationError(emailSchema, email);
    if (!error && !(await User.isEmailTaken(email))) {
      return email;
    }
    console.log(error ? `  ${error}` : '  That email is already used by another account.');
  }
};

const promptPassword = async () => {
  for (;;) {
    const password = await askHidden('Admin password (min 8 chars, letters and numbers): ');
    const error = validationError(passwordSchema, password);
    if (error) {
      console.log(`  ${error}`);
      // Local CLI confirmation, not an auth check: no timing-attack surface.
      // eslint-disable-next-line security/detect-possible-timing-attacks
    } else if ((await askHidden('Confirm password: ')) !== password) {
      console.log("  Passwords don't match. Try again.");
    } else {
      return password;
    }
  }
};

/** @returns {Promise<{ email: string, password: string }>} */
const credentialsFromEnv = async () => {
  const { email, password } = config.seedAdmin;
  if (!email || !password) {
    throw new Error(
      [
        'No terminal to ask in, and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set.',
        'Run `npm run seed` from PowerShell or Command Prompt (in Git Bash: `winpty npm run seed`),',
        'or set both variables (e.g. on Railway).',
      ].join('\n'),
    );
  }
  const error = validationError(emailSchema, email) || validationError(passwordSchema, password);
  if (error) {
    throw new Error(`Invalid SEED_ADMIN_* value: ${error}`);
  }
  return { email, password };
};

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    const existing = await User.findOne({ role: roles.ADMIN, status: userStatuses.ACTIVE });
    if (existing) {
      console.log(`An active Admin already exists (${existing.email}). Nothing to do.`);
      return;
    }

    const interactive = Boolean(process.stdin.isTTY);
    if (interactive) {
      console.log('BugTrail first-run setup: create the Admin account.\n');
    }
    const credentials = interactive
      ? { email: await promptEmail(), password: await promptPassword() }
      : await credentialsFromEnv();

    const { user } = await userService.createFirstAdmin(credentials);
    console.log(`\nAdmin created: ${user.email}. Sign in and change your name under your profile.`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
