import { faker } from '@faker-js/faker';
import { User } from '../../../src/models/index.js';
import { allPermissions } from '../../../src/config/permissions.js';
import { getRolePermissions } from '../../../src/config/roles.js';

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

    test('should throw a validation error if role is not in the enum', async () => {
      newUser.role = 'superuser';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });

    test('should throw a validation error if status is unknown', async () => {
      newUser.status = 'deleted';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });
  });

  describe('User getPermissions()', () => {
    const newUserDoc = (role) => new User({ name: 'A', email: 'a@example.com', password: 'password1', role });

    test("should return the role's permissions from code", () => {
      const user = newUserDoc('qa');
      expect(user.getPermissions()).toEqual(getRolePermissions('qa'));
      expect(user.hasPermission('bug:verify')).toBe(true);
      expect(user.hasPermission('bug:delete')).toBe(false);
    });

    test('should give a Developer no verify rights', () => {
      expect(newUserDoc('developer').hasPermission('bug:verify')).toBe(false);
    });

    test('should always return the full catalog for Admin', () => {
      const user = newUserDoc('admin');
      expect(user.isAdmin()).toBe(true);
      expect(user.getPermissions()).toEqual([...allPermissions]);
    });

    test('should fail closed (no permissions) when the user has no role', () => {
      expect(newUserDoc(null).getPermissions()).toEqual([]);
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
