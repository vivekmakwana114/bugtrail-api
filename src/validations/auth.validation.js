import Joi from 'joi';
import { password } from './custom.validation.js';

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().trim().required().max(100),
    // Required at sign-up (decided 2026-10-13): the approver sees their job title in the queue.
    designation: Joi.string().trim().required().max(100),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    password: Joi.string().required().custom(password),
  }),
};

const changePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password).invalid(Joi.ref('currentPassword')).messages({
      'any.invalid': 'newPassword must be different from currentPassword',
    }),
  }),
};

// logout and refresh-tokens read the httpOnly cookie, so they take no body.

export default {
  register,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
};
