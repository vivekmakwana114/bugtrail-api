import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import { bugService } from '../services/index.js';
import { bugSerializer } from '../serializers/index.js';

const createBug = catchAsync(async (req, res) => {
  const result = await bugService.createBug(req.user, req.body);
  res.status(httpStatus.CREATED).send(bugSerializer.bugDetail(result));
});

const getBugs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['projectId', 'status', 'assignee', 'moduleName', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await bugService.queryBugs(req.user, filter, options);
  res.send(bugSerializer.bugPage(result));
});

const getBug = catchAsync(async (req, res) => {
  const result = await bugService.getBug(req.user, req.params.bugId);
  res.send(bugSerializer.bugDetail(result));
});

const updateBug = catchAsync(async (req, res) => {
  const result = await bugService.updateBug(req.user, req.params.bugId, req.body);
  res.send(bugSerializer.bugDetail(result));
});

const changeStatus = catchAsync(async (req, res) => {
  const result = await bugService.changeStatus(req.user, req.params.bugId, req.body);
  res.send(bugSerializer.bugDetail(result));
});

const assignBug = catchAsync(async (req, res) => {
  const result = await bugService.assignBug(req.user, req.params.bugId, req.body);
  res.send(bugSerializer.bugDetail(result));
});

const deleteBug = catchAsync(async (req, res) => {
  await bugService.deleteBug(req.user, req.params.bugId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getActivity = catchAsync(async (req, res) => {
  const result = await bugService.getActivity(req.user, req.params.bugId);
  res.send(bugSerializer.activityList(result));
});

export default {
  createBug,
  getBugs,
  getBug,
  updateBug,
  changeStatus,
  assignBug,
  deleteBug,
  getActivity,
};
