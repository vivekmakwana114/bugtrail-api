import nodemailer from 'nodemailer';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { EmailOutbox } from '../models/index.js';

/*
 * Two steps, on purpose:
 *   queueEmail() → called by request handlers. Inserts an EmailOutbox row and returns at once:
 *                  a slow or broken SMTP server never slows down or fails an API request.
 *   sendEmail()  → called only by jobs/emailOutbox.worker.js, which retries failures.
 */

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== 'test' && config.email.enabled) {
  transport
    .verify()
    .then(() => logger.info('Connected to email server'))
    .catch(() => logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env'));
}

/**
 * Send an email now (the outbox worker's job; request handlers use queueEmail).
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text) => {
  // EMAIL_ENABLED=false (the default) lets you run locally without SMTP.
  // The body is only logged outside production, because it can contain reset links.
  if (!config.email.enabled) {
    logger.info(`Email disabled, not sent: "${subject}" to ${to}`);
    if (config.env === 'development') {
      logger.info(text);
    }
    return;
  }
  const msg = { from: config.email.from, to, subject, text };
  await transport.sendMail(msg);
};

/**
 * Put an email in the outbox; the worker sends it within ~15 seconds.
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise<EmailOutbox>}
 */
const queueEmail = async (to, subject, text) => EmailOutbox.create({ to, subject, text });

/**
 * @param {string} path - web app path, e.g. /login
 * @returns {string} absolute link into the web app
 */
const appLink = (path) => `${config.clientUrl}${path}`;

/**
 * @param {string} to
 * @param {string} token
 */
const sendResetPasswordEmail = async (to, token) => {
  const subject = 'Reset your BugTrail password';
  const resetPasswordUrl = appLink(`/reset-password?token=${encodeURIComponent(token)}`);
  const text = `Hi,

To reset your password, open this link: ${resetPasswordUrl}
It expires soon. If you didn't ask to reset your password, ignore this email.`;
  await queueEmail(to, subject, text);
};

/**
 * Account approved (or reactivated).
 * @param {{ email: string, name: string }} user
 */
const sendAccountActiveEmail = async ({ email, name }) => {
  const text = `Hi ${name},

Your BugTrail account is active. Sign in here: ${appLink('/login')}`;
  await queueEmail(email, 'Your BugTrail account is active', text);
};

/**
 * @param {{ email: string, name: string }} user
 */
const sendAccountRejectedEmail = async ({ email, name }) => {
  const text = `Hi ${name},

Your request for a BugTrail account wasn't approved. If you think this is a mistake, contact your BugTrail admin.`;
  await queueEmail(email, 'Your BugTrail account request', text);
};

export default {
  transport,
  sendEmail,
  queueEmail,
  appLink,
  sendResetPasswordEmail,
  sendAccountActiveEmail,
  sendAccountRejectedEmail,
};
