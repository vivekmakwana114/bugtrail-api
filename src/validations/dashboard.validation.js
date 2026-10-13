import Joi from 'joi';
import { projectRef } from './custom.validation.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "2026-10-12" or a full ISO date-time ("2026-10-12T09:00:00+05:30").
 * A date-only `to` means the END of that day, so from=to=2026-10-12 covers the whole day.
 * Date-only values are UTC days; send full date-times with an offset for a local day.
 * @param {{ endOfDay?: boolean }} options
 */
const isoDate = ({ endOfDay = false } = {}) =>
  Joi.string().custom((value, helpers) => {
    const date = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(date.getTime())) {
      return helpers.message('{{#label}} must be a date (2026-10-12) or an ISO date-time');
    }
    if (endOfDay && DATE_ONLY.test(value)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  });

const scopeKeys = {
  // Id or key (BT): the dashboard URL carries the key (?project=BT).
  projectId: Joi.string().custom(projectRef),
  from: isoDate(),
  to: isoDate({ endOfDay: true }),
};

const fromBeforeTo = (value, helpers) =>
  value.from && value.to && value.from > value.to ? helpers.message('from must be on or before to') : value;

const dashboardQuery = {
  query: Joi.object().keys(scopeKeys).custom(fromBeforeTo),
};

const slowestTickets = {
  query: Joi.object()
    .keys({
      ...scopeKeys,
      open: Joi.boolean(), // only tickets that haven't passed yet
      limit: Joi.number().integer().min(1).max(50).default(10),
    })
    .custom(fromBeforeTo),
};

export default {
  getSummary: dashboardQuery,
  getBugStatus: dashboardQuery,
  getDeveloperPerformance: dashboardQuery,
  getSlowestTickets: slowestTickets,
};
