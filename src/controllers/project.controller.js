import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import { projectService } from '../services/index.js';
import { projectSerializer } from '../serializers/index.js';

const createProject = catchAsync(async (req, res) => {
  const result = await projectService.createProject(req.user, req.body);
  res.status(httpStatus.CREATED).send(projectSerializer.projectDetail(result));
});

const getProjects = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await projectService.queryProjects(req.user, filter, options);
  res.send(projectSerializer.projectPage(result));
});

const getProject = catchAsync(async (req, res) => {
  const result = await projectService.getProject(req.user, req.params.projectId);
  res.send(projectSerializer.projectDetail(result));
});

const updateProject = catchAsync(async (req, res) => {
  const result = await projectService.updateProject(req.user, req.params.projectId, req.body);
  res.send(projectSerializer.projectDetail(result));
});

const deleteProject = catchAsync(async (req, res) => {
  await projectService.deleteProject(req.user, req.params.projectId);
  res.status(httpStatus.NO_CONTENT).send();
});

const addMembers = catchAsync(async (req, res) => {
  const members = await projectService.addMembers(req.user, req.params.projectId, req.body.userIds);
  res.send(projectSerializer.memberList(members));
});

const removeMember = catchAsync(async (req, res) => {
  const members = await projectService.removeMember(req.user, req.params.projectId, req.params.userId);
  res.send(projectSerializer.memberList(members));
});

export default {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  addMembers,
  removeMember,
};
