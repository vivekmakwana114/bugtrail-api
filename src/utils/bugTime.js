import { bugStatuses, bugStatusValues } from '../config/bugStatuses.js';

/**
 * Time a bug spent in each status, from its activity trail.
 *
 * Each `created` / `status_changed` event starts a stretch in its `to` status that lasts until
 * the next event (or until now for the current status). Time in `pass` isn't counted: passing
 * stops the clock, the same way it stops the bug's age.
 *
 *   created→reported 10:00 │ ongoing 10:30 │ resolved 12:00 │ (now 12:15)
 *   reported 30m, ongoing 1h30m, resolved 15m
 *
 * @param {Array<{ to: string, createdAt: Date }>} events - oldest first
 * @param {Date} [now]
 * @returns {Object<string, number>} status → milliseconds (pass excluded)
 */
const getTimeInStatus = (events, now = new Date()) => {
  const totals = Object.fromEntries(
    bugStatusValues.filter((status) => status !== bugStatuses.PASS).map((status) => [status, 0]),
  );
  events.forEach((event, i) => {
    if (event.to in totals) {
      const end = events[i + 1]?.createdAt ?? now;
      totals[event.to] += end.getTime() - event.createdAt.getTime();
    }
  });
  return totals;
};

export default getTimeInStatus;
