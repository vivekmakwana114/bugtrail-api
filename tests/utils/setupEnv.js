/**
 * Runs before every test file (jest `setupFiles`), before any src module is imported.
 * Gives config.js the env vars it requires so tests run without a .env file (e.g. in CI).
 * Real values from a local .env still win, because dotenv never overwrites set variables
 * and we only fill in what's missing.
 */
const testDefaults = {
  NODE_ENV: 'test',
  MONGODB_URL: 'mongodb://127.0.0.1:27017/bugtrail-unused', // replaced by mongodb-memory-server
  JWT_SECRET: 'test-jwt-secret',
};

Object.entries(testDefaults).forEach(([key, value]) => {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
});

// Tests never send real email, whatever a local .env says: no SMTP_HOST means "log only".
// Set before dotenv runs, so a developer's SMTP settings can't win here.
process.env.SMTP_HOST = '';
