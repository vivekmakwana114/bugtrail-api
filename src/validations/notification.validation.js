import Joi from 'joi';
import { objectId } from './custom.validation.js';

const getNotifications = {
  query: Joi.object().keys({
    unread: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const markRead = {
  params: Joi.object().keys({ notificationId: Joi.string().required().custom(objectId) }),
};

export default { getNotifications, markRead };
