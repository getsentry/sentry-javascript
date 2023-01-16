import { parseSemver } from '@sentry/utils';
const assert = require('assert');
const { getAsync } = require('../utils/server');

const NODE_VERSION = parseSemver(process.versions.node);

// This test asserts that our wrapping of `res.end` doesn't break API routes on Vercel if people call `res.json` or
// `res.send` multiple times in one request handler.
//  https://github.com/getsentry/sentry-javascript/issues/6670
module.exports = async ({ url: urlBase }) => {
  if (NODE_VERSION.major && NODE_VERSION.major <= 10) {
    console.log('not running doubleEndMethodOnVercel test on Node 10');
    return;
  }
  const response = await getAsync(`${urlBase}/api/doubleEndMethodOnVercel`);
  assert.equal(response, '{"success":true}');
};
