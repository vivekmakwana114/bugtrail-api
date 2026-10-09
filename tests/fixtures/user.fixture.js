import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import User from '../../src/models/user.model.js';
import { userStatuses } from '../../src/config/userStatuses.js';
import { insertDefaultRoles } from './role.fixture.js';

const password = 'password1';
const salt = bcrypt.genSaltSync(8);
const hashedPassword = bcrypt.hashSync(password, salt);

/**
 * Users reference roles by slug here; insertUsers swaps the slug for the real role id.
 * @param {Object} overrides
 */
const makeUser = (overrides) => ({
  _id: new mongoose.Types.ObjectId(),
  name: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  password,
  status: userStatuses.ACTIVE,
  roleSlug: 'developer',
  ...overrides,
});

const userOne = makeUser({ roleSlug: 'developer' });
const userTwo = makeUser({ roleSlug: 'developer' });
const admin = makeUser({ roleSlug: 'admin' });
const projectManager = makeUser({ roleSlug: 'project-manager' });
const pendingUser = makeUser({ roleSlug: null, status: userStatuses.PENDING });
const suspendedUser = makeUser({ roleSlug: 'developer', status: userStatuses.SUSPENDED });

/**
 * Insert users (and the default roles they point at).
 * @param {Object[]} users - fixtures from makeUser
 * @returns {Promise<Record<string, Role>>} roles keyed by slug
 */
const insertUsers = async (users) => {
  const roles = await insertDefaultRoles();
  await User.insertMany(
    users.map(({ roleSlug, ...user }) => ({
      ...user,
      password: hashedPassword,
      role: roleSlug ? roles[roleSlug]._id : null,
    })),
  );
  return roles;
};

export { userOne, userTwo, admin, projectManager, pendingUser, suspendedUser, insertUsers };
