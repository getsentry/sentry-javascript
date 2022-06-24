#! /usr/bin/env node
/* eslint-disable no-console */
const SentryCli = require('@sentry/cli');
const argv = require('yargs/yargs')(process.argv.slice(2))
  .option('release', { type: 'string', describe: 'The release number', demandOption: true })
  .option('urlPrefix', { type: 'string', describe: 'The url prefix for the sourcemaps' })
  .option('buildPath', { type: 'string', describe: 'The path to the build directory' })
  .usage('Usage: $0 --release RELEASE [--urlPrefix URL_PREFIX] [--buildPath BUILD_PATH]').argv;

const RELEASE = argv.release;

if (!RELEASE) {
  console.error('No release provided.');
  process.exit(1);
}

const URL_PREFIX = argv.urlPrefix || '~/build/';
const BUILD_PATH = argv.buildPath || 'public/build';

const sentry = new SentryCli();

async function createRelease() {
  await sentry.releases.new(RELEASE);

  await sentry.releases.uploadSourceMaps(RELEASE, {
    urlPrefix: URL_PREFIX,
    include: [BUILD_PATH],
  });

  await sentry.releases.finalize(RELEASE);
}

createRelease();
