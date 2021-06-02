const { waitForAll } = require('../utils/common');
const { expectRequestCount, isEventRequest, expectEvent } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await waitForAll([page.goto(`${url}/crashed`), page.waitForRequest(isEventRequest)]);

  expectEvent(requests.events[0], {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Crashed',
        },
      ],
    },
  });

  await expectRequestCount(requests, { events: 1 });
};
