import userSerializer from './user.serializer.js';
import bugSerializer from './bug.serializer.js';

/**
 * @param {{ developers: Object[] }} result - developer is a User (or null)
 * @returns {Object}
 */
const developerPerformance = ({ developers }) => ({
  developers: developers.map(({ developer, ...stats }) => ({
    developer: userSerializer.userRef(developer),
    ...stats,
  })),
});

/**
 * @param {Array<{ bug: Bug, project: Project }>} rows
 * @returns {{ tickets: Object[] }} same shape as a ticket grid row
 */
const slowestTickets = (rows) => ({ tickets: rows.map(bugSerializer.bugListItem) });

export default { developerPerformance, slowestTickets };
