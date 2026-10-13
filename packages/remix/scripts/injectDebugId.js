/* eslint-disable no-console */
const { createSentrySDK } = require('sentry');

async function injectDebugId(buildPath) {
  try {
    await createSentrySDK().sourcemap.inject({ directory: buildPath });
  } catch (error) {
    console.warn('[sentry] Failed to inject debug ids.');
    console.error(error);
  }
}

module.exports = {
  injectDebugId,
};
