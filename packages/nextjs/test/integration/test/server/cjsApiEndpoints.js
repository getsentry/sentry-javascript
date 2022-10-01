const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const responseUnwrapped = await getAsync(`${urlBase}/api/withSentryAPI/unwrapped/cjsExport`);
  assert.equal(responseUnwrapped, '{"success":true}');

  const responseWrapped = await getAsync(`${urlBase}/api/withSentryAPI/wrapped/cjsExport`);
  assert.equal(responseWrapped, '{"success":true}');
};
