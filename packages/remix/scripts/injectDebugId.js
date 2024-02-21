/* eslint-disable no-console */
const { execSync } = require('child_process');

const SentryCli = require('@sentry/cli');

function injectDebugId(buildPath) {
  const cliPath = SentryCli.getPath();

  try {
    execSync(`${cliPath} sourcemaps inject ${buildPath}`);
  } catch (error) {
    console.warn('[sentry] Failed to inject debug ids.');
    console.error(error);
  }
}

module.exports = {
  injectDebugId,
};
