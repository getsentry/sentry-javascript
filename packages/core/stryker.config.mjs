/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'yarn',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
};

export default config;
