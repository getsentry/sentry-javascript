/* eslint-disable no-console */
const SentryCli = require('@sentry/cli');

const { deleteSourcemaps } = require('./deleteSourcemaps');

const sentry = new SentryCli();

async function createRelease(argv, URL_PREFIX, BUILD_PATH) {
  const RELEASE = argv.release || (await sentry.releases.proposeVersion());

  await sentry.releases.new(RELEASE);

  await sentry.releases.uploadSourceMaps(RELEASE, {
    urlPrefix: URL_PREFIX,
    include: [BUILD_PATH],
    useArtifactBundle: !argv.disableDebugIds,
  });

  await sentry.releases.finalize(RELEASE);

  if (argv.deleteAfterUpload) {
    try {
      deleteSourcemaps(BUILD_PATH);
    } catch (error) {
      console.warn(`Failed to delete sourcemaps in build directory: ${BUILD_PATH}`);
      console.error(error);
    }
  }
}

module.exports = {
  createRelease,
};
