import mongoose from 'mongoose';
import validator from 'validator';
import bcrypt from 'bcryptjs';
import { toJSON, paginate } from './plugins/index.js';
import { userStatuses } from '../config/userStatuses.js';
import { roles, roleValues, getRolePermissions } from '../config/roles.js';

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error('Password must contain at least one letter and one number');
        }
      },
      private: true, // used by the toJSON plugin
    },
    // A pending self-registered user has no role until an approver assigns one.
    // Permissions are derived from this (config/roles.js); they are not stored.
    role: {
      type: String,
      enum: [...roleValues, null],
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(userStatuses),
      default: userStatuses.PENDING,
      index: true,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

/** @returns {boolean} */
userSchema.methods.isAdmin = function () {
  return this.role === roles.ADMIN;
};

/**
 * Permissions come from the role, defined in code. A user with no role has none (fails closed).
 * @returns {string[]}
 */
userSchema.methods.getPermissions = function () {
  return getRolePermissions(this.role);
};

/**
 * @param {string} permission
 * @returns {boolean}
 */
userSchema.methods.hasPermission = function (permission) {
  return this.getPermissions().includes(permission);
};

userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

/**
 * @typedef User
 */
const User = mongoose.model('User', userSchema);

export default User;
