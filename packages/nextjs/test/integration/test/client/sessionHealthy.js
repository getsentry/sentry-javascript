const { expectRequestCount, waitForAll, expectSession, isSessionRequest } = require('../utils');

module.exports = async ({ page, url, requests }) => {
  await waitForAll([page.goto(`${url}/healthy`), page.waitForRequest(isSessionRequest)]);

  expectSession(requests.sessions[0], {
    init: true,
    status: 'ok',
    errors: 0,
  });

  await expectRequestCount(requests, { sessions: 1 });
};
