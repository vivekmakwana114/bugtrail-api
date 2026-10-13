import Joi from 'joi';
import { password, objectId, sortBy } from './custom.validation.js';
import { userStatuses } from '../config/userStatuses.js';
import { roleValues } from '../config/roles.js';

// Only the defined roles are accepted. Permissions are never sent: they follow from the role.
const role = Joi.string().valid(...roleValues);

/** Free-text job title next to the role ("MERN Developer"); '' clears it. */
const designation = Joi.string().trim().max(100).allow('');

const avatarUrl = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(2048)
  .allow(null);

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().trim().required().max(100),
    role: role.required(),
    // Required when an Admin adds someone (decided 2026-10-13); optional when editing.
    designation: Joi.string().trim().required().max(100),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    // Part of the name or email, case-insensitive (the users screen's search box).
    search: Joi.string().trim().max(100),
    role,
    status: Joi.string().valid(...Object.values(userStatuses)),
    sortBy: sortBy(['name', 'email', 'role', 'status', 'createdAt', 'lastLoginAt']),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      name: Joi.string().trim().max(100),
      role,
      designation,
      avatarUrl,
    })
    .min(1),
};

// `pending` is not a target: a user can't be sent back to the approval queue.
const updateUserStatus = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid(userStatuses.ACTIVE, userStatuses.SUSPENDED, userStatuses.REJECTED),
    role,
    // With approval only, like role: the approver can set the job title in the same step.
    designation,
  }),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateMe = {
  body: Joi.object()
    .keys({
      name: Joi.string().trim().max(100),
      avatarUrl,
    })
    .min(1),
};

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  updateMe,
};
