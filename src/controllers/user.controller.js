import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { userService } from '../services/index.js';
import { userSerializer } from '../serializers/index.js';

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUserAsActor(req.user, req.body);
  res.status(httpStatus.CREATED).send(userSerializer.userDetail(user));
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'status', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(userSerializer.userPage(result));
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(userSerializer.userDetail(user));
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserAsActor(req.user, req.params.userId, req.body);
  res.send(userSerializer.userDetail(user));
});

const updateUserStatus = catchAsync(async (req, res) => {
  const user = await userService.updateUserStatusAsActor(req.user, req.params.userId, req.body);
  res.send(userSerializer.userDetail(user));
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserAsActor(req.user, req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateMe = catchAsync(async (req, res) => {
  const user = await userService.updateMe(req.user, req.body);
  res.send(userSerializer.userDetail(user));
});

const getAssignableUsers = catchAsync(async (req, res) => {
  const users = await userService.getAssignableUsers();
  res.send({ users: users.map(userSerializer.userSummary) });
});

export default {
  createUser,
  getUsers,
  getAssignableUsers,
  getUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  updateMe,
};
