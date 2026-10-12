import Joi from 'joi';
import { objectId, sortBy } from './custom.validation.js';
import { projectStatusValues } from '../config/projectStatuses.js';
import { PROJECT_KEY_PATTERN } from '../models/project.model.js';

const projectId = Joi.string().required().custom(objectId);
const userIds = Joi.array().items(Joi.string().custom(objectId)).unique().max(100);

const name = Joi.string().trim().max(100);
const description = Joi.string().trim().max(2000).allow('');
const status = Joi.string().valid(...projectStatusValues);

const createProject = {
  body: Joi.object().keys({
    name: name.required(),
    // "bt" is accepted and stored as "BT"
    key: Joi.string()
      .trim()
      .uppercase()
      .pattern(PROJECT_KEY_PATTERN)
      .required()
      .messages({ 'string.pattern.base': 'key must be 2-10 letters or digits and start with a letter (e.g. BT)' }),
    description,
    status,
    manager: Joi.string().custom(objectId).allow(null),
    members: userIds,
  }),
};

const getProjects = {
  query: Joi.object().keys({
    status,
    search: Joi.string().trim().max(100),
    sortBy: sortBy(['name', 'key', 'status', 'createdAt', 'updatedAt']),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getProject = {
  params: Joi.object().keys({ projectId }),
};

// No `key` (it never changes) and no `members` (they have their own endpoints).
const updateProject = {
  params: Joi.object().keys({ projectId }),
  body: Joi.object()
    .keys({
      name,
      description,
      status,
      manager: Joi.string().custom(objectId).allow(null),
    })
    .min(1),
};

const deleteProject = {
  params: Joi.object().keys({ projectId }),
};

const addMembers = {
  params: Joi.object().keys({ projectId }),
  body: Joi.object().keys({
    userIds: userIds.min(1).required(),
  }),
};

const removeMember = {
  params: Joi.object().keys({
    projectId,
    userId: Joi.string().required().custom(objectId),
  }),
};

export default {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  addMembers,
  removeMember,
};
