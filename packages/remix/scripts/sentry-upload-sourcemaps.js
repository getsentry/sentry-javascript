#!/usr/bin/env node
const yargs = require('yargs');

const { createRelease } = require('./createRelease');
const { injectDebugId } = require('./injectDebugId');

const DEFAULT_URL_PREFIX = '~/build/';
const DEFAULT_BUILD_PATH = 'public/build';

const argv = yargs(process.argv.slice(2))
  .option('release', {
    type: 'string',
    describe:
      'The release number\n' +
      "If not provided, a new release id will be determined by Sentry CLI's `propose-version`.\n" +
      'See: https://docs.sentry.io/product/releases/suspect-commits/#using-the-cli\n',
  })
  .option('org', {
    type: 'string',
    describe: 'The Sentry organization slug',
  })
  .option('project', {
    type: 'string',
    describe: 'The Sentry project slug',
  })
  .option('url', {
    type: 'string',
    describe: 'The Sentry server URL',
  })
  .option('urlPrefix', {
    type: 'string',
    describe: 'URL prefix to add to the beginning of all filenames',
    default: DEFAULT_URL_PREFIX,
  })
  .option('buildPath', {
    type: 'string',
    describe: 'The path to the build directory',
    default: DEFAULT_BUILD_PATH,
  })
  .option('disableDebugIds', {
    type: 'boolean',
    describe: 'Disable the injection and upload of debug ids',
    default: false,
  })
  .option('deleteAfterUpload', {
    type: 'boolean',
    describe: 'Delete sourcemaps after uploading',
    default: true,
  })
  .usage(
    'Usage: $0\n' +
      '  [--release RELEASE]\n' +
      '  [--org ORG]\n' +
      '  [--project PROJECT]\n' +
      '  [--url URL]\n' +
      '  [--urlPrefix URL_PREFIX]\n' +
      '  [--buildPath BUILD_PATH]\n\n' +
      '  [--disableDebugIds true|false]\n\n' +
      '  [--deleteAfterUpload true|false]\n\n' +
      'This CLI tool will upload sourcemaps to Sentry for the given release.\n' +
      'It has defaults for URL prefix and build path for Remix builds, but you can override them.\n\n' +
      'If you need a more advanced configuration, you can use `sentry-cli` instead.\n' +
      'https://github.com/getsentry/sentry-cli',
  )
  .wrap(120).argv;

const buildPath = argv.buildPath || DEFAULT_BUILD_PATH;
const urlPrefix = argv.urlPrefix || DEFAULT_URL_PREFIX;

if (!argv.disableDebugIds) {
  injectDebugId(buildPath);
}

createRelease(argv, urlPrefix, buildPath);
