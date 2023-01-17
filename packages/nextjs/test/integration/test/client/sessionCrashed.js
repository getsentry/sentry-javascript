const { expectRequestCount, isSessionRequest, expectSession, extractEnvelopeFromRequest } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  const sessionRequestPromise1 = page.waitForRequest(request => {
    if (isSessionRequest(request)) {
      const { item } = extractEnvelopeFromRequest(request);
      return item.init === true && item.status === 'ok' && item.errors === 0;
    } else {
      return false;
    }
  });

  const sessionRequestPromise2 = page.waitForRequest(request => {
    if (isSessionRequest(request)) {
      const { item } = extractEnvelopeFromRequest(request);
      return item.init === false && item.status === 'crashed' && item.errors === 1;
    } else {
      return false;
    }
  });

  await page.goto(`${url}/crashed`);
  await sessionRequestPromise1;
  await sessionRequestPromise2;

  await expectRequestCount(requests, { sessions: 2 });
};
