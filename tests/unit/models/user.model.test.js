import { faker } from '@faker-js/faker';
import { Role, User } from '../../../src/models/index.js';

describe('User model', () => {
  describe('User validation', () => {
    let newUser;
    beforeEach(() => {
      newUser = {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
      };
    });

    test('should correctly validate a valid user and default to pending with no role', async () => {
      const user = new User(newUser);
      await expect(user.validate()).resolves.toBeUndefined();
      expect(user.status).toBe('pending');
      expect(user.role).toBeNull();
    });

    test('should throw a validation error if email is invalid', async () => {
      newUser.email = 'invalidEmail';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });

    test('should throw a validation error if password is too short or lacks letters/numbers', async () => {
      await expect(new User({ ...newUser, password: 'passwo1' }).validate()).rejects.toThrow();
      await expect(new User({ ...newUser, password: 'password' }).validate()).rejects.toThrow();
      await expect(new User({ ...newUser, password: '11111111' }).validate()).rejects.toThrow();
    });

    test('should throw a validation error if role is not an ObjectId', async () => {
      newUser.role = 'admin';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });

    test('should throw a validation error if status is unknown', async () => {
      newUser.status = 'deleted';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });
  });

  describe('User getPermissions()', () => {
    const newUserDoc = () => new User({ name: 'A', email: 'a@example.com', password: 'password1' });

    test('should return the populated role permissions', () => {
      const user = newUserDoc();
      user.role = new Role({ name: 'QA', permissions: ['bug:read', 'bug:verify'] }); // behaves like a populated ref
      expect(user.getPermissions()).toEqual(['bug:read', 'bug:verify']);
      expect(user.hasPermission('bug:verify')).toBe(true);
      expect(user.hasPermission('bug:delete')).toBe(false);
    });

    test('should fail closed (no permissions) when the user has no role', () => {
      expect(newUserDoc().getPermissions()).toEqual([]);
    });
  });

  describe('User toJSON()', () => {
    test('should not return user password when toJSON is called', () => {
      const newUser = {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
      };
      expect(new User(newUser).toJSON()).not.toHaveProperty('password');
    });
  });
});
