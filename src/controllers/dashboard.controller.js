import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import { dashboardService } from '../services/index.js';
import { dashboardSerializer } from '../serializers/index.js';

const scopeFilter = (query) => pick(query, ['projectId', 'from', 'to']);

// Summary and bug-status are plain counts (no documents), so they're sent as built.
const getSummary = catchAsync(async (req, res) => {
  res.send(await dashboardService.getSummary(req.user, scopeFilter(req.query)));
});

const getBugStatus = catchAsync(async (req, res) => {
  res.send(await dashboardService.getBugStatus(req.user, scopeFilter(req.query)));
});

const getDeveloperPerformance = catchAsync(async (req, res) => {
  const result = await dashboardService.getDeveloperPerformance(req.user, scopeFilter(req.query));
  res.send(dashboardSerializer.developerPerformance(result));
});

const getSlowestTickets = catchAsync(async (req, res) => {
  const filter = { ...scopeFilter(req.query), ...pick(req.query, ['open', 'limit']) };
  const rows = await dashboardService.getSlowestTickets(req.user, filter);
  res.send(dashboardSerializer.slowestTickets(rows));
});

export default { getSummary, getBugStatus, getDeveloperPerformance, getSlowestTickets };
