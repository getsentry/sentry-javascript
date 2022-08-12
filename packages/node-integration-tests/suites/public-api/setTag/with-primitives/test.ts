import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set primitive tags', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const envelope = envelopes[1];

  assertSentryEvent(envelope[2], {
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
