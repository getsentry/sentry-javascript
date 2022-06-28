const SentryCli = require('@sentry/cli');
const sentry = new SentryCli();

async function createRelease(argv, DEFAULT_URL_PREFIX, DEFAULT_BUILD_PATH) {
  const RELEASE = argv.release || (await sentry.releases.proposeVersion());
  const URL_PREFIX = argv.urlPrefix || DEFAULT_URL_PREFIX;
  const BUILD_PATH = argv.buildPath || DEFAULT_BUILD_PATH;

  await sentry.releases.new(RELEASE);

  await sentry.releases.uploadSourceMaps(RELEASE, {
    urlPrefix: URL_PREFIX,
    include: [BUILD_PATH],
  });

  await sentry.releases.finalize(RELEASE);
}

module.exports = {
  createRelease,
};
