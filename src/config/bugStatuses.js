/**
 * Ticket lifecycle:
 *   reported → ongoing → resolved ──QA──► pass
 *                 ▲          └────QA──► failed (failCount + 1)
 *                 └────── dev picks it up again
 */
const bugStatuses = Object.freeze({
  REPORTED: 'reported',
  ONGOING: 'ongoing',
  RESOLVED: 'resolved',
  PASS: 'pass',
  FAILED: 'failed',
});

const bugStatusValues = Object.freeze(Object.values(bugStatuses));

/*
 * The transition table: the ONE place that says who may move a bug from where to where.
 * bug.service turns it into `allowedStatuses` for the current user (sent with every bug, so the
 * UI only offers valid options) and enforces it on PATCH /bugs/:id/status.
 *
 *   bug:set_any_status (QA, Admin) → any status to any other
 *   bug:verify                     → verifyTransitions (QA's Pass / Failed decision)
 *   bug:progress, as the assignee  → progressTransitions (the developer's own work)
 */
const progressTransitions = Object.freeze({
  [bugStatuses.REPORTED]: [bugStatuses.ONGOING],
  [bugStatuses.ONGOING]: [bugStatuses.RESOLVED],
  // A failed ticket goes straight back to work; it doesn't wait for QA to reopen it.
  [bugStatuses.FAILED]: [bugStatuses.ONGOING],
});

const verifyTransitions = Object.freeze({
  [bugStatuses.RESOLVED]: [bugStatuses.PASS, bugStatuses.FAILED],
});

/**
 * The project card's pie has three slices. The mapping lives on the server so every
 * client draws the same chart:
 *   reported → nobody has picked it up yet
 *   ongoing  → being worked on, including tickets QA sent back (failed)
 *   resolved → done from the developer's side, including verified ones (pass)
 */
const pieSlices = Object.freeze({
  reported: [bugStatuses.REPORTED],
  ongoing: [bugStatuses.ONGOING, bugStatuses.FAILED],
  resolved: [bugStatuses.RESOLVED, bugStatuses.PASS],
});

/** Every status except pass: the ticket still needs someone. */
const openBugStatuses = Object.freeze(bugStatusValues.filter((status) => status !== bugStatuses.PASS));

/**
 * An open bug reported longer ago than this is "ageing": it feeds the project card's trouble line
 * ("2 open > 7d"). The web app shows the same number of days (src/config/statuses.ts, TROUBLE_AGE_DAYS).
 */
const AGED_OPEN_DAYS = 7;

/**
 * @param {Date} [now]
 * @returns {Date} bugs created before this and not passed count as aged
 */
const getAgedOpenCutoff = (now = new Date()) => new Date(now.getTime() - AGED_OPEN_DAYS * 24 * 60 * 60 * 1000);

/** BugActivity.type values */
const bugActivityTypes = Object.freeze({
  CREATED: 'created',
  UPDATED: 'updated',
  STATUS_CHANGED: 'status_changed',
  ASSIGNED: 'assigned',
  DELETED: 'deleted',
});

export {
  bugStatuses,
  bugStatusValues,
  progressTransitions,
  verifyTransitions,
  pieSlices,
  openBugStatuses,
  AGED_OPEN_DAYS,
  getAgedOpenCutoff,
  bugActivityTypes,
};
