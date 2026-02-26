#!/usr/bin/env node
const { parseArgs } = require('node:util');

const { createRelease } = require('./createRelease');
const { injectDebugId } = require('./injectDebugId');

const DEFAULT_URL_PREFIX = '~/build/';
const DEFAULT_BUILD_PATH = 'public/build';

const USAGE = `Usage: sentry-upload-sourcemaps [options]

Options:
  --release RELEASE        The release number. If not provided, a new release
                           id will be determined by Sentry CLI's propose-version.
                           See: https://docs.sentry.io/product/releases/suspect-commits/#using-the-cli
  --org ORG                The Sentry organization slug
  --project PROJECT        The Sentry project slug
  --url URL                The Sentry server URL
  --urlPrefix URL_PREFIX   URL prefix to add to the beginning of all filenames
                           [default: "${DEFAULT_URL_PREFIX}"]
  --buildPath BUILD_PATH   The path to the build directory
                           [default: "${DEFAULT_BUILD_PATH}"]
  --disableDebugIds        Disable the injection and upload of debug ids
                           [default: false]
  --deleteAfterUpload      Delete sourcemaps after uploading
                           [default: true]
  --keepAfterUpload        Keep sourcemaps after uploading (prevents deletion).
                           Use this instead of --no-deleteAfterUpload for
                           compatibility with Node < 20.16.
                           [default: false]
  -h, --help               Show this help message

This CLI tool will upload sourcemaps to Sentry for the given release.
It has defaults for URL prefix and build path for Remix builds, but you
can override them.

If you need a more advanced configuration, you can use sentry-cli instead.
https://github.com/getsentry/sentry-cli`;

// Note: Unlike yargs, util.parseArgs with strict mode (the default):
// - Rejects unknown flags (stricter, catches typos)
// - Does not auto-convert kebab-case to camelCase (use --urlPrefix, not --url-prefix)
// - Boolean flags cannot take =true/=false values (use bare --flag to enable)
const { values: argv } = parseArgs({
  args: process.argv.slice(2),
  options: {
    release:           { type: 'string' },
    org:               { type: 'string' },
    project:           { type: 'string' },
    url:               { type: 'string' },
    urlPrefix:         { type: 'string', default: DEFAULT_URL_PREFIX },
    buildPath:         { type: 'string', default: DEFAULT_BUILD_PATH },
    disableDebugIds:   { type: 'boolean', default: false },
    deleteAfterUpload: { type: 'boolean', default: true },
    keepAfterUpload:   { type: 'boolean', default: false },
    help:              { type: 'boolean', short: 'h', default: false },
  },
});

if (argv.help) {
  // eslint-disable-next-line no-console
  console.log(USAGE);
  process.exit(0);
}

// --keepAfterUpload overrides --deleteAfterUpload to prevent source map deletion.
// This flag exists because util.parseArgs does not support --no-deleteAfterUpload
// on Node < 20.16, so without it there is no way to disable deletion.
if (argv.keepAfterUpload) {
  argv.deleteAfterUpload = false;
}

const buildPath = argv.buildPath || DEFAULT_BUILD_PATH;
const urlPrefix = argv.urlPrefix || DEFAULT_URL_PREFIX;

if (!argv.disableDebugIds) {
  injectDebugId(buildPath);
}

createRelease(argv, urlPrefix, buildPath);
