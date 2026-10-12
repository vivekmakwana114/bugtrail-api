import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import Project from '../../src/models/project.model.js';
import { userOne, userTwo, projectManager, qaUser } from './user.fixture.js';

/**
 * @param {Object} overrides
 */
const makeProject = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: faker.company.name(),
  key: faker.string.alpha({ length: 4, casing: 'upper' }),
  description: '',
  status: 'active',
  manager: null,
  members: [],
  ...overrides,
});

// projectManager runs Alpha; userOne (developer) works on it.
const projectOne = makeProject({
  name: 'Alpha',
  key: 'ALPHA',
  manager: projectManager._id,
  members: [projectManager._id, userOne._id],
});
// Nobody from projectOne is in Beta.
const projectTwo = makeProject({ name: 'Beta', key: 'BETA', members: [userTwo._id, qaUser._id] });

/**
 * @param {Object[]} projects - fixtures from makeProject
 */
const insertProjects = async (projects) => {
  await Project.insertMany(projects);
};

export { makeProject, projectOne, projectTwo, insertProjects };
