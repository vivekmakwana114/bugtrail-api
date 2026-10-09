import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { userService } from '../services/index.js';
import { userStatuses } from '../config/userStatuses.js';

// Phase 2 adds approval (PATCH /:id/status), PATCH /me and the escalation guards.

const createUser = catchAsync(async (req, res) => {
  // Users created by an admin skip the approval queue.
  const user = await userService.createUser({ ...req.body, status: userStatuses.ACTIVE });
  res.status(httpStatus.CREATED).send(await user.populate('role'));
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'status']);
  const options = { ...pick(req.query, ['sortBy', 'limit', 'page']), populate: 'role' };
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserWithRoleById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(await user.populate('role'));
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
};
