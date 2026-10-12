import { Role } from '../../../src/models/index.js';
import { allPermissions } from '../../../src/config/permissions.js';

describe('Role model', () => {
  describe('Role validation', () => {
    test('should derive the slug from the name', async () => {
      const role = new Role({ name: '  Team Lead ' });
      await expect(role.validate()).resolves.toBeUndefined();
      expect(role.slug).toBe('team-lead');
    });

    test('should accept permissions from the catalog', async () => {
      const role = new Role({ name: 'Viewer', permissions: ['bug:read', 'project:read'] });
      await expect(role.validate()).resolves.toBeUndefined();
    });

    test('should reject a permission that is not in the catalog and name it', async () => {
      const role = new Role({ name: 'Bad', permissions: ['bug:read', 'bug:fly'] });
      await expect(role.validate()).rejects.toThrow(/bug:fly/);
    });

    test('should force Admin to the full catalog and mark it as a system role', async () => {
      const role = new Role({ name: 'Admin', slug: 'admin', permissions: ['bug:read'], isSystem: false });
      await role.validate();
      expect(role.permissions).toEqual([...allPermissions]);
      expect(role.isSystem).toBe(true);
    });
  });

  describe('Role getPermissions()', () => {
    test('should return the stored permissions without duplicates', () => {
      const role = new Role({ name: 'QA', permissions: ['bug:read', 'bug:read', 'bug:verify'] });
      expect(role.getPermissions()).toEqual(['bug:read', 'bug:verify']);
    });

    test('should always return the full catalog for Admin', () => {
      const role = new Role({ name: 'Admin', slug: 'admin', permissions: [] });
      expect(role.getPermissions()).toEqual([...allPermissions]);
    });
  });
});
