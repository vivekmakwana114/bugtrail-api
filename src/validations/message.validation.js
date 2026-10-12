import Joi from 'joi';
import { objectId } from './custom.validation.js';

const body = Joi.string().trim().min(1).max(5000);

const listMessages = {
  // Id or key, like GET /bugs/:bugId
  params: Joi.object().keys({
    bugId: Joi.alternatives()
      .try(Joi.string().custom(objectId), Joi.string().pattern(/^[A-Za-z][A-Za-z0-9]{1,9}-\d{1,9}$/))
      .required(),
  }),
  query: Joi.object().keys({
    before: Joi.string().custom(objectId), // nextCursor from the previous page
    limit: Joi.number().integer().min(1).max(100).default(30),
  }),
};

const sendMessage = {
  params: Joi.object().keys({ bugId: Joi.string().required().custom(objectId) }),
  body: Joi.object().keys({
    body: body.required(),
    mentions: Joi.array().items(Joi.string().custom(objectId)).unique().max(20),
  }),
};

const editMessage = {
  params: Joi.object().keys({ messageId: Joi.string().required().custom(objectId) }),
  body: Joi.object().keys({ body: body.required() }),
};

const deleteMessage = {
  params: Joi.object().keys({ messageId: Joi.string().required().custom(objectId) }),
};

export default { listMessages, sendMessage, editMessage, deleteMessage };
