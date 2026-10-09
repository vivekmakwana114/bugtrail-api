import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import User from '../../src/models/user.model.js';
import { userStatuses } from '../../src/config/userStatuses.js';
import { roles } from '../../src/config/roles.js';

const password = 'password1';
const salt = bcrypt.genSaltSync(8);
const hashedPassword = bcrypt.hashSync(password, salt);

/**
 * An active user (permissions follow from the role).
 * @param {Object} overrides
 */
const makeUser = ({ role = roles.DEVELOPER, ...overrides } = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  password,
  status: userStatuses.ACTIVE,
  role,
  ...overrides,
});

const userOne = makeUser({ role: roles.DEVELOPER });
const userTwo = makeUser({ role: roles.DEVELOPER });
const admin = makeUser({ role: roles.ADMIN });
const adminTwo = makeUser({ role: roles.ADMIN });
const qaUser = makeUser({ role: roles.QA });
const projectManager = makeUser({ role: roles.PROJECT_MANAGER });
const pendingUser = makeUser({ role: null, status: userStatuses.PENDING });
const suspendedUser = makeUser({ role: roles.DEVELOPER, status: userStatuses.SUSPENDED });

/**
 * @param {Object[]} users - fixtures from makeUser
 */
const insertUsers = async (users) => {
  await User.insertMany(users.map((user) => ({ ...user, password: hashedPassword })));
};

export { makeUser, userOne, userTwo, admin, adminTwo, qaUser, projectManager, pendingUser, suspendedUser, insertUsers };
