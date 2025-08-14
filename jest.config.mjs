/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.cjs'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
  transform: {},
  verbose: false,
};

export default config;
