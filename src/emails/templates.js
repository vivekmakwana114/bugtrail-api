import { notificationTypes } from '../config/notificationTypes.js';
import { renderEmail } from './layout.js';

/*
 * One template per email BugTrail sends. Each has its own label, accent and button, so people
 * can tell at a glance what an email is about. All return { subject, html, text }.
 */

/** "Riya Shah" → "Riya": greetings use the first name. */
const firstName = (name) =>
  String(name ?? '')
    .trim()
    .split(/\s+/)[0] || 'there';

/**
 * @param {{ url: string }} input
 */
const resetPasswordEmail = ({ url }) =>
  renderEmail({
    subject: 'Reset your BugTrail password',
    preheader: 'Use this link to choose a new password. It expires soon.',
    label: 'Password reset',
    heading: 'Choose a new password',
    greeting: 'Hi,',
    paragraphs: [
      'Someone (hopefully you) asked to reset the password for this BugTrail account. The link below lets you choose a new one.',
    ],
    cta: { label: 'Choose a new password', url },
    footnote:
      "The link expires soon and works once. If you didn't ask for this, ignore this email: your password stays the same.",
  });

/**
 * Account approved (or reactivated).
 * @param {{ name: string, url: string, role?: string }} input
 */
const accountActiveEmail = ({ name, url, role }) =>
  renderEmail({
    subject: 'Your BugTrail account is active',
    preheader: 'You can sign in now.',
    label: 'Account approved',
    accent: 'pass',
    heading: "You're in. Your account is active",
    greeting: `Hi ${firstName(name)},`,
    paragraphs: ['An admin approved your BugTrail account. Sign in with the email and password you registered with.'],
    facts: role ? [{ label: 'Role', value: role }] : undefined,
    cta: { label: 'Sign in to BugTrail', url },
  });

/**
 * @param {{ name: string }} input
 */
const accountRejectedEmail = ({ name }) =>
  renderEmail({
    subject: 'Your BugTrail account request',
    preheader: "Your request wasn't approved.",
    label: 'Account request',
    accent: 'failed',
    heading: "Your request wasn't approved",
    greeting: `Hi ${firstName(name)},`,
    paragraphs: [
      "Your request for a BugTrail account wasn't approved. If you think this is a mistake, contact your BugTrail admin.",
    ],
  });

/** Where a status-change email's accent comes from: the status named at the end of its title. */
const STATUS_ACCENTS = ['reported', 'ongoing', 'resolved', 'pass', 'failed'];

/** Label, accent and button text per notification type. */
const NOTIFICATION_STYLES = {
  [notificationTypes.BUG_ASSIGNED]: { label: 'Assigned to you', accent: 'reported', cta: 'Open the bug' },
  [notificationTypes.BUG_STATUS_CHANGED]: { label: 'Status changed', accent: 'neutral', cta: 'Open the bug' },
  [notificationTypes.BUG_MESSAGE]: { label: 'New message', accent: 'neutral', cta: 'Reply in BugTrail' },
  [notificationTypes.BUG_MENTIONED]: { label: 'You were mentioned', accent: 'ongoing', cta: 'Reply in BugTrail' },
  [notificationTypes.PROJECT_MEMBER_ADDED]: { label: 'Added to a project', accent: 'resolved', cta: 'Open the project' },
  [notificationTypes.USER_REGISTERED]: { label: 'Waiting for approval', accent: 'ongoing', cta: 'Review the request' },
};

/**
 * An email for a notification (sent only when the action's "Send email" box was ticked).
 * @param {{ type: string, title: string, message: string, url?: string|null, recipientName: string, actorName?: string }} input
 */
const notificationEmail = ({ type, title, message, url, recipientName, actorName }) => {
  const style = NOTIFICATION_STYLES[type] ?? { label: 'Update', accent: 'neutral', cta: 'Open in BugTrail' };
  let { accent } = style;
  if (type === notificationTypes.BUG_STATUS_CHANGED) {
    const status = title.trim().split(/\s+/).pop()?.toLowerCase();
    if (STATUS_ACCENTS.includes(status)) accent = status;
  }
  // Chat emails quote the message itself, so the reader gets it without opening the app.
  const isChat = type === notificationTypes.BUG_MESSAGE || type === notificationTypes.BUG_MENTIONED;
  return renderEmail({
    subject: title,
    preheader: message,
    label: style.label,
    accent,
    heading: title,
    greeting: `Hi ${firstName(recipientName)},`,
    paragraphs: isChat ? [actorName ? `${actorName} wrote:` : 'New message:'] : [message],
    quote: isChat ? message : undefined,
    cta: url ? { label: style.cta, url } : undefined,
    footnote: actorName ? `This email was sent because ${actorName} ticked "Send email" on this change.` : undefined,
  });
};

export { resetPasswordEmail, accountActiveEmail, accountRejectedEmail, notificationEmail, NOTIFICATION_STYLES };
