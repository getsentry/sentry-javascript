const assert = require('assert');
const { getAsync } = require('../utils/server');

// This test asserts that our wrapping of `res.end` doesn't break API routes on Vercel if people call `res.json` or
// `res.send` multiple times in one request handler.
//  https://github.com/getsentry/sentry-javascript/issues/6670
module.exports = async ({ url: urlBase }) => {
  const response = await getAsync(`${urlBase}/api/doubleEndMethodOnVercel`);
  assert.equal(response, '{"success":true}');
};
