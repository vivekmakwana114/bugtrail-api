import nodemailer from 'nodemailer';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { EmailOutbox } from '../models/index.js';
import { roleDefinitions } from '../config/roles.js';
import { accountActiveEmail, accountRejectedEmail, resetPasswordEmail } from '../emails/templates.js';

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
    .catch(() => logger.warn('Unable to connect to the email server. Check the SMTP_* variables.'));
}

/**
 * Send an email now (the outbox worker's job; request handlers use queueEmail).
 * @param {string} to
 * @param {string} subject
 * @param {string} text - the plain-text part (always sent, and what the dev console shows)
 * @param {string} [html] - the designed part (src/emails), shown by clients that render HTML
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text, html) => {
  // No SMTP_HOST (the default locally) means log instead of send, so you can run without SMTP.
  // The body is only logged in development, because it can contain reset links.
  if (!config.email.enabled) {
    logger.info(`No SMTP_HOST, email not sent: "${subject}" to ${to}`);
    if (config.env === 'development') {
      logger.info(text);
    }
    return;
  }
  const msg = { from: config.email.from, to, subject, text, ...(html && { html }) };
  await transport.sendMail(msg);
};

/**
 * Put an email in the outbox; the worker sends it within ~15 seconds.
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} [html]
 * @returns {Promise<EmailOutbox>}
 */
const queueEmail = async (to, subject, text, html) => EmailOutbox.create({ to, subject, text, html });

/**
 * Queue a rendered template (src/emails).
 * @param {string} to
 * @param {{ subject: string, text: string, html: string }} email
 */
const queueTemplate = (to, { subject, text, html }) => queueEmail(to, subject, text, html);

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
  const url = appLink(`/reset-password?token=${encodeURIComponent(token)}`);
  await queueTemplate(to, resetPasswordEmail({ url }));
};

/**
 * Account approved (or reactivated).
 * @param {{ email: string, name: string, role?: string|null }} user
 */
const sendAccountActiveEmail = async ({ email, name, role }) => {
  const roleLabel = role ? roleDefinitions[role]?.label : undefined;
  await queueTemplate(email, accountActiveEmail({ name, url: appLink('/login'), role: roleLabel }));
};

/**
 * @param {{ email: string, name: string }} user
 */
const sendAccountRejectedEmail = async ({ email, name }) => {
  await queueTemplate(email, accountRejectedEmail({ name }));
};

export default {
  transport,
  sendEmail,
  queueEmail,
  queueTemplate,
  appLink,
  sendResetPasswordEmail,
  sendAccountActiveEmail,
  sendAccountRejectedEmail,
};
