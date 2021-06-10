const { waitForAll } = require('../utils/common');
const { expectRequestCount, isSessionRequest, expectSession } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await waitForAll([page.goto(`${url}/healthy`), page.waitForRequest(isSessionRequest)]);

  expectSession(requests.sessions[0], {
    init: true,
    status: 'ok',
    errors: 0,
  });

  await expectRequestCount(requests, { sessions: 1 });
};
