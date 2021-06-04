const { waitForAll } = require('../utils/common');
const { expectRequestCount, isSessionRequest, expectSession } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await waitForAll([
    page.goto(`${url}/crashed`),
    page.waitForRequest(isSessionRequest),
    page.waitForRequest(isSessionRequest),
  ]);

  expectSession(requests.sessions[0], {
    init: true,
    status: 'ok',
    errors: 0,
  });

  expectSession(requests.sessions[1], {
    init: false,
    status: 'crashed',
    errors: 1,
  });

  await expectRequestCount(requests, { sessions: 2 });
};
