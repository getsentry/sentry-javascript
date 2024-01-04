import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should apply scopes correctly', async () => {
  const env = await TestEnv.init(__dirname);
  const events = await env.getMultipleEnvelopeRequest({ count: 3 });

  assertSentryEvent(events[0][2], {
    message: 'outer_before',
    extra: {
      aa: 'aa',
      bb: 'bb',
    },
  });

  assertSentryEvent(events[1][2], {
    message: 'inner',
    extra: {
      aa: 'aa',
      bb: 'bb',
      cc: 'cc',
    },
  });

  assertSentryEvent(events[2][2], {
    message: 'outer_after',
    extra: {
      aa: 'aa',
      bb: 'bb',
    },
  });
});
