export default {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  // No transform: source and tests are native ES modules, run via
  // node --experimental-vm-modules (see the "test" script in package.json).
  transform: {},
  setupFiles: ['<rootDir>/tests/utils/setupEnv.js'],
  // The first run downloads a MongoDB binary for mongodb-memory-server.
  testTimeout: 30000,
  restoreMocks: true,
  coveragePathIgnorePatterns: ['node_modules', 'src/config', 'src/app.js', 'src/scripts', 'tests'],
  coverageReporters: ['text', 'lcov', 'clover', 'html'],
};
