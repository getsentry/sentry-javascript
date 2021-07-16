const { waitForAll } = require('../utils/common');
const { expectRequestCount, isEventRequest, expectEvent } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await page.goto(`${url}/errorClick`);

  await waitForAll([page.click('button'), page.waitForRequest(isEventRequest)]);

  expectEvent(requests.events[0], {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Frontend Error',
        },
      ],
    },
  });

  await expectRequestCount(requests, { events: 1 });
};
