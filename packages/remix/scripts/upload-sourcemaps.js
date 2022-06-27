#! /usr/bin/env node
const SentryCli = require('@sentry/cli');
const argv = require('yargs/yargs')(process.argv.slice(2))
  .option('release', { type: 'string', describe: 'The release number' })
  .option('urlPrefix', { type: 'string', describe: 'The url prefix for the sourcemaps' })
  .option('buildPath', { type: 'string', describe: 'The path to the build directory' })
  .usage(
    'Usage: $0 [--release RELEASE] [--urlPrefix URL_PREFIX] [--buildPath BUILD_PATH] \n\n' +
      'If you need a more advanced configuration, you can use `sentry-cli` instead.\n' +
      'https://github.com/getsentry/sentry-cli',
  ).argv;

const sentry = new SentryCli();

async function createRelease() {
  const RELEASE = argv.release || (await sentry.releases.proposeVersion());
  const URL_PREFIX = argv.urlPrefix || '~/build/';
  const BUILD_PATH = argv.buildPath || 'public/build';

  await sentry.releases.new(RELEASE);

  await sentry.releases.uploadSourceMaps(RELEASE, {
    urlPrefix: URL_PREFIX,
    include: [BUILD_PATH],
  });

  await sentry.releases.finalize(RELEASE);
}

createRelease();
