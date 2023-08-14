/* eslint-disable no-console */
const { execSync } = require('child_process');

function injectDebugId(buildPath) {
  try {
    execSync(`node ./node_modules/@sentry/cli/bin/sentry-cli sourcemaps inject ${buildPath}`);
  } catch (error) {
    console.warn('Failed to inject debug ids.');
    console.error(error);
  }
}

module.exports = {
  injectDebugId,
};
