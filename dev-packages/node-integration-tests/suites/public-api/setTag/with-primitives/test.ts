import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should set primitive tags', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
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
