/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'yarn',
  reporters: ['html', 'clear-text', 'progress', 'json', 'dashboard', 'dashboard'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  dashboard: {
    project: 'github.com/Lms24/sentry-javascript-test-fork',
    module: '@sentry/core',
    version: 'develop',
  },
};

export default config;
