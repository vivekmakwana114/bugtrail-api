/**
 * How long after sending a message its author may still edit it (decided 2026-10-13): long
 * enough to fix a typo, short enough that nobody rewrites something others already read and
 * replied to. After that the message is final (it can still be deleted).
 * The web app mirrors this value (bugtrail-web src/features/chat/config.ts) only to hide the
 * Edit action in time; this API check is the rule.
 */
const MESSAGE_EDIT_WINDOW_MS = 15 * 1000;

export { MESSAGE_EDIT_WINDOW_MS };
