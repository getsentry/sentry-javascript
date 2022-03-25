import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should set primitive tags', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'primitive_tags',
    tags: {
      tag_1: 'foo',
      tag_2: 3.141592653589793,
      tag_3: false,
      tag_4: null,
      tag_6: -1,
    },
  });
});
