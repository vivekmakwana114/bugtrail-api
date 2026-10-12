import { Project } from '../../../src/models/index.js';

describe('Project model', () => {
  const valid = () => ({ name: 'BugTrail', key: 'bt' });

  test('should validate a minimal project, uppercase the key and default to active with no members', async () => {
    const project = new Project(valid());
    await expect(project.validate()).resolves.toBeUndefined();
    expect(project).toMatchObject({ key: 'BT', status: 'active', manager: null, deletedAt: null, bugCounter: 0 });
    expect(project.members).toHaveLength(0);
  });

  test.each(['B', '1BT', 'B-T', 'ABCDEFGHIJK'])('should reject the key %p', async (key) => {
    await expect(new Project({ ...valid(), key }).validate()).rejects.toThrow();
  });

  test('should reject an unknown status', async () => {
    await expect(new Project({ ...valid(), status: 'paused' }).validate()).rejects.toThrow();
  });

  test('should never hide the key in JSON, but hide the internal bug counter', () => {
    const json = new Project(valid()).toJSON();
    expect(json).toHaveProperty('key', 'BT');
    expect(json).not.toHaveProperty('bugCounter');
  });
});
