import mongoose from 'mongoose';
import { User } from '../../../src/models/index.js';
import { canSeeAllProjects, projectScopeFilter } from '../../../src/utils/scope.js';

const userWithRole = (role) => new User({ _id: new mongoose.Types.ObjectId(), name: 'x', email: 'x@example.com', role });

describe('Project scope', () => {
  test('an Admin (project:read_all) sees every non-deleted project', () => {
    const admin = userWithRole('admin');
    expect(canSeeAllProjects(admin)).toBe(true);
    expect(projectScopeFilter(admin)).toEqual({ deletedAt: null });
  });

  test.each(['project_manager', 'developer', 'qa'])('a %s sees only non-deleted projects they are a member of', (role) => {
    const user = userWithRole(role);
    expect(canSeeAllProjects(user)).toBe(false);
    expect(projectScopeFilter(user)).toEqual({ deletedAt: null, members: user._id });
  });

  test('a user without a role is still limited to their memberships (fails closed)', () => {
    const user = userWithRole(null);
    expect(projectScopeFilter(user)).toEqual({ deletedAt: null, members: user._id });
  });

  test('merged last, the scope overrides a client filter that tries to widen it', () => {
    const user = userWithRole('developer');
    const filter = { members: new mongoose.Types.ObjectId(), deletedAt: { $ne: null }, ...projectScopeFilter(user) };
    expect(filter).toEqual({ members: user._id, deletedAt: null });
  });
});
