/* eslint-disable no-console, no-await-in-loop */
/**
 * npm run seed: first-run setup. Creates the Admin and nothing else.
 *
 *  - It asks for the Admin's email, then the password (hidden, typed twice). Credentials are
 *    never read from env vars, so they never sit in a dashboard or a shell history.
 *  - It needs a terminal. For Railway, run it from your machine with Railway's variables:
 *    `railway run npm run seed` (the database must be reachable from your machine).
 *  - If an active Admin already exists it does nothing, so running it twice is harmless.
 *
 * Everyone else registers and is approved by the Admin, who assigns their role there.
 */
import Joi from 'joi';
import mongoose from 'mongoose';
import config from '../config/config.js';
import applyDnsOverride from '../config/dns.js';
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

const run = async () => {
  // Fail before touching the database: without a terminal there's no one to ask.
  if (!process.stdin.isTTY) {
    throw new Error(
      [
        'npm run seed needs a terminal to ask for the Admin email and password.',
        'Run it from PowerShell or Command Prompt (in Git Bash: `winpty npm run seed`).',
        'For Railway: `railway run npm run seed` from your machine.',
      ].join('\n'),
    );
  }

  applyDnsOverride(); // no-op unless DNS_SERVERS is set (a local workaround)
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    const existing = await User.findOne({ role: roles.ADMIN, status: userStatuses.ACTIVE });
    if (existing) {
      console.log(`An active Admin already exists (${existing.email}). Nothing to do.`);
      return;
    }

    console.log('BugTrail first-run setup: create the Admin account.\n');
    const credentials = { email: await promptEmail(), password: await promptPassword() };

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
