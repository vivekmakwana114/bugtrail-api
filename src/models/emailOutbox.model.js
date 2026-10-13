import mongoose from 'mongoose';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Emails waiting to be sent (the "outbox" pattern). The API only inserts a row, which is fast and
 * never fails because SMTP is slow or down; jobs/emailOutbox.worker.js sends it in the background
 * with retries. Rows survive restarts, which an in-memory queue wouldn't.
 *
 *   pending → sending → sent
 *      ▲         │
 *      └─────────┴──→ failed (after MAX_ATTEMPTS)
 */
const emailOutboxStatuses = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
});

const emailOutboxSchema = mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, maxlength: 300 },
    text: { type: String, required: true },
    // The designed version (src/emails). Optional: rows queued before it existed have text only.
    html: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(emailOutboxStatuses),
      default: emailOutboxStatuses.PENDING,
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    // When a worker claimed it. A row stuck in `sending` (the process died mid-send) is
    // claimed again after a timeout, so an email can't get lost.
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// The worker's query: due pending rows, oldest first.
emailOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
// Sent rows are deleted after 30 days; pending and failed rows have no sentAt, so they stay.
emailOutboxSchema.index({ sentAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_IN_SECONDS });

/**
 * @typedef EmailOutbox
 */
const EmailOutbox = mongoose.model('EmailOutbox', emailOutboxSchema);

export { emailOutboxStatuses };
export default EmailOutbox;
