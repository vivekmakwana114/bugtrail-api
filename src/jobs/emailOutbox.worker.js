import { EmailOutbox } from '../models/index.js';
import { emailOutboxStatuses } from '../models/emailOutbox.model.js';
import emailService from '../services/email.service.js';
import logger from '../config/logger.js';

/*
 * Sends queued emails in the background (see models/emailOutbox.model.js for the why).
 *
 * Every TICK_MS:
 *   1. claim one due email with a single atomic findOneAndUpdate (pending → sending)
 *   2. send it
 *   3. mark it sent, or schedule a retry with backoff (30s, 1m, 2m, 4m), or give up after MAX_ATTEMPTS
 * ... up to BATCH_SIZE emails per tick.
 *
 * Why the atomic claim: if two workers ever ran (a second PM2 instance by mistake, an overlapping
 * deploy), both would see the same pending row with "find, then update", and the email would go
 * out twice. With findOneAndUpdate only one of them gets the row.
 *
 * Delivery is at-least-once: if the process dies after SMTP accepted the email but before it's
 * marked sent, it is sent again once its lock times out. A rare duplicate beats a lost reset link.
 */

const TICK_MS = 15 * 1000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 30 * 1000;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @returns {Promise<EmailOutbox|null>} the claimed email, or null when nothing is due
 */
const claimNext = async () => {
  const now = new Date();
  return EmailOutbox.findOneAndUpdate(
    {
      $or: [
        { status: emailOutboxStatuses.PENDING, nextAttemptAt: { $lte: now } },
        // Stuck: claimed by a process that died mid-send.
        { status: emailOutboxStatuses.SENDING, lockedAt: { $lte: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
      ],
    },
    { $set: { status: emailOutboxStatuses.SENDING, lockedAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { nextAttemptAt: 1 } },
  );
};

/**
 * @param {EmailOutbox} email - already claimed
 */
const deliver = async (email) => {
  try {
    await emailService.sendEmail(email.to, email.subject, email.text, email.html ?? undefined);
    await EmailOutbox.updateOne(
      { _id: email._id },
      { $set: { status: emailOutboxStatuses.SENT, sentAt: new Date(), lockedAt: null, lastError: null } },
    );
  } catch (error) {
    const giveUp = email.attempts >= MAX_ATTEMPTS;
    const delay = RETRY_BASE_MS * 2 ** (email.attempts - 1);
    await EmailOutbox.updateOne(
      { _id: email._id },
      {
        $set: {
          status: giveUp ? emailOutboxStatuses.FAILED : emailOutboxStatuses.PENDING,
          nextAttemptAt: new Date(Date.now() + delay),
          lockedAt: null,
          lastError: error.message.slice(0, 500),
        },
      },
    );
    const outcome = giveUp ? 'giving up' : `retrying in ${delay / 1000}s`;
    logger.warn(`Email "${email.subject}" to ${email.to} failed (attempt ${email.attempts}), ${outcome}: ${error.message}`);
  }
};

let running = false;

/** One pass over the outbox. Skipped if the previous pass is still running. */
const tick = async () => {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < BATCH_SIZE; i += 1) {
      // Sequential on purpose: a handful of emails, and it keeps SMTP connections calm.
      // eslint-disable-next-line no-await-in-loop
      const email = await claimNext();
      if (!email) break;
      // eslint-disable-next-line no-await-in-loop
      await deliver(email);
    }
  } catch (error) {
    logger.error(`Email outbox tick failed: ${error.message}`);
  } finally {
    running = false;
  }
};

/**
 * Start the worker (src/index.js, after MongoDB is connected).
 * @returns {() => void} stop function, for graceful shutdown
 */
const startEmailOutboxWorker = () => {
  const timer = setInterval(tick, TICK_MS);
  tick();
  logger.info(`Email outbox worker running every ${TICK_MS / 1000}s`);
  return () => clearInterval(timer);
};

export default startEmailOutboxWorker;
