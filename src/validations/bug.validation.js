import Joi from 'joi';
import { objectId, sortBy, driveUrl } from './custom.validation.js';
import { bugStatusValues } from '../config/bugStatuses.js';

const bugId = Joi.string().required().custom(objectId);
// GET accepts the id or the key (BT-42), so the web app can use readable URLs.
const bugRef = Joi.alternatives()
  .try(Joi.string().custom(objectId), Joi.string().pattern(/^[A-Za-z][A-Za-z0-9]{1,9}-\d{1,9}$/))
  .required()
  .messages({ 'alternatives.match': 'bugId must be a bug id or a bug key like BT-42' });

const title = Joi.string().trim().min(1).max(200);
const moduleName = Joi.string().trim().min(1).max(100);
const description = Joi.string().trim().max(10000).allow('');
const attachments = Joi.array()
  .items(
    Joi.object().keys({
      title: Joi.string().trim().min(1).max(200).required(),
      url: Joi.string().trim().max(2048).required().custom(driveUrl),
    }),
  )
  .max(20);
const status = Joi.string().valid(...bugStatusValues);
// The "Send email" checkbox. In-app notifications are always sent; email only when ticked.
const sendEmail = Joi.boolean().default(false);

/** "reported,ongoing" → ['reported', 'ongoing'] */
const statusList = Joi.string().custom((value, helpers) => {
  const list = [...new Set(value.split(',').map((item) => item.trim()))];
  if (list.some((item) => !bugStatusValues.includes(item))) {
    return helpers.message(`{{#label}} must be a comma-separated list of: ${bugStatusValues.join(', ')}`);
  }
  return list;
});

const createBug = {
  body: Joi.object().keys({
    project: Joi.string().required().custom(objectId),
    title: title.required(),
    moduleName: moduleName.required(),
    description,
    attachments,
    status,
    assignee: Joi.string().custom(objectId).allow(null),
    sendEmail,
  }),
};

const getBugs = {
  query: Joi.object().keys({
    projectId: Joi.string().custom(objectId),
    status: statusList,
    assignee: Joi.alternatives().try(Joi.string().valid('me', 'none'), Joi.string().custom(objectId)),
    moduleName: Joi.string().trim().max(100),
    search: Joi.string().trim().max(100),
    sortBy: sortBy(['age', 'failCount', 'updatedAt', 'createdAt', 'bugNumber']),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getBug = {
  params: Joi.object().keys({ bugId: bugRef }),
};

// Status and assignee have their own endpoints (their own rules, activity and notifications).
const updateBug = {
  params: Joi.object().keys({ bugId }),
  body: Joi.object().keys({ title, moduleName, description, attachments }).min(1),
};

const changeStatus = {
  params: Joi.object().keys({ bugId }),
  body: Joi.object().keys({
    status: status.required(),
    sendEmail,
  }),
};

const assignBug = {
  params: Joi.object().keys({ bugId }),
  body: Joi.object().keys({
    assignee: Joi.string().custom(objectId).allow(null).required(),
    sendEmail,
  }),
};

const deleteBug = {
  params: Joi.object().keys({ bugId }),
};

const getActivity = {
  params: Joi.object().keys({ bugId: bugRef }),
};

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
