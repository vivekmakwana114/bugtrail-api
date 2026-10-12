/**
 * Ticket lifecycle (the transition rules arrive with the Bug model in Phase 4):
 *   reported → ongoing → resolved → pass
 *                 ▲          └────→ failed (back to the developer)
 *                 └──────────────────┘
 */
const bugStatuses = Object.freeze({
  REPORTED: 'reported',
  ONGOING: 'ongoing',
  RESOLVED: 'resolved',
  PASS: 'pass',
  FAILED: 'failed',
});

const bugStatusValues = Object.freeze(Object.values(bugStatuses));

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

export { bugStatuses, bugStatusValues, pieSlices };
