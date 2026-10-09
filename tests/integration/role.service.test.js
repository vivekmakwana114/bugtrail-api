import setupTestDB from '../utils/setupTestDB.js';
import { Role } from '../../src/models/index.js';
import { roleService } from '../../src/services/index.js';
import { allPermissions } from '../../src/config/permissions.js';

setupTestDB();

describe('roleService.ensureDefaultRoles (npm run seed)', () => {
  test('should create Admin, Project Manager, Developer and QA', async () => {
    await roleService.ensureDefaultRoles();
    const slugs = (await Role.find().sort('slug')).map((role) => role.slug);
    expect(slugs).toEqual(['admin', 'developer', 'project-manager', 'qa']);
  });

  test('should give QA the verify rights and the Developer neither of them', async () => {
    await roleService.ensureDefaultRoles();
    const qa = await Role.findOne({ slug: 'qa' });
    const developer = await Role.findOne({ slug: 'developer' });
    expect(qa.permissions).toEqual(expect.arrayContaining(['bug:verify', 'bug:set_any_status']));
    expect(developer.permissions).not.toContain('bug:verify');
    expect(developer.permissions).not.toContain('bug:set_any_status');
  });

  test('should be idempotent and keep permissions an Admin has edited', async () => {
    await roleService.ensureDefaultRoles();
    await Role.updateOne({ slug: 'developer' }, { $set: { permissions: ['bug:read'] } });

    await roleService.ensureDefaultRoles();

    expect(await Role.countDocuments()).toBe(4);
    const developer = await Role.findOne({ slug: 'developer' });
    expect(developer.permissions).toEqual(['bug:read']);
  });

  test('should restore Admin to the full catalog on re-run', async () => {
    await roleService.ensureDefaultRoles();
    await Role.updateOne({ slug: 'admin' }, { $set: { permissions: ['bug:read'] } });

    await roleService.ensureDefaultRoles();

    const adminRole = await Role.findOne({ slug: 'admin' });
    expect(adminRole.permissions).toEqual([...allPermissions]);
  });
});
