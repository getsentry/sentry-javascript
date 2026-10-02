/* eslint-disable no-console */
const { createSentrySDK } = require('sentry');

const { deleteSourcemaps } = require('./deleteSourcemaps');

async function createRelease(argv, URL_PREFIX, BUILD_PATH) {
  const sentry = createSentrySDK({
    url: argv.url,
    org: argv.org,
    project: argv.project,
  });

  let release;

  if (!argv.release) {
    try {
      release = (await sentry.release['propose-version']()).version;
    } catch (error) {
      console.warn('[sentry] Failed to propose a release version.');
      console.warn('[sentry] You can specify a release version with `--release` flag.');
      console.warn('[sentry] For example: `sentry-upload-sourcemaps --release 1.0.0`');
      throw error;
    }
  } else {
    release = argv.release;
  }

  // The release API requires a project, and the one given to the SDK does not reach this call.
  const project = argv.project ?? process.env.SENTRY_PROJECT;
  if (!project) {
    throw new Error('[sentry] A project is required to create a release. Pass `--project` or set `SENTRY_PROJECT`.');
  }
  await sentry.release.create({ orgVersion: release, project });

  try {
    await sentry.sourcemap.upload({
      directory: BUILD_PATH,
      release,
      urlPrefix: URL_PREFIX,
      noRewrite: argv.disableDebugIds,
    });
  } catch {
    console.warn('[sentry] Failed to upload sourcemaps.');
  }

  try {
    await sentry.release.finalize({ orgVersion: release });
  } catch {
    console.warn('[sentry] Failed to finalize release.');
  }

  if (argv.deleteAfterUpload) {
    try {
      deleteSourcemaps(BUILD_PATH);
    } catch (error) {
      console.warn(`[sentry] Failed to delete sourcemaps in build directory: ${BUILD_PATH}`);
      console.error(error);
    }
  }
}

module.exports = {
  createRelease,
};
