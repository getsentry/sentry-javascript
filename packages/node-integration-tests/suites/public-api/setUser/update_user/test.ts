import { assertSentryEvent, getMultipleEventRequests, runServer } from '../../../../utils';

test('should update user', async () => {
  const url = await runServer(__dirname);
  const events = await getMultipleEventRequests(url, 2);

  assertSentryEvent(events[0], {
    message: 'first_user',
    user: {
      id: 'foo',
      ip_address: 'bar',
    },
  });

  assertSentryEvent(events[1], {
    message: 'second_user',
    user: {
      id: 'baz',
    },
  });
});
