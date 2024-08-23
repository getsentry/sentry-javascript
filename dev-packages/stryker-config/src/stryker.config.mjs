import child_process from 'child_process';

// STRYKER_DASHBOARD_API_KEY env variable needs to be set to upload to dashboard

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'yarn',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  dashboard: {
    // TODO: change to getsentry/sentry-javascript if we ship this into production
    project: 'github.com/Lms24/sentry-javascript-test-fork',
    version: child_process.execSync('git rev-parse HEAD').toString().trim(),
  },
  clearTextReporter: {
    logTests: false,
    reportMutants: false,
    reportScoreTable: true,
    skipFull: false,
  },
};

export default config;
