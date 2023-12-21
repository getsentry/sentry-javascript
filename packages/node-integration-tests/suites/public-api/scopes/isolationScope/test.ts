import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should apply scopes correctly', async () => {
  const env = await TestEnv.init(__dirname);
  const events = await env.getMultipleEnvelopeRequest({ count: 4 });

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
      dd: 'dd',
      ee: 'ee',
    },
  });

  assertSentryEvent(events[2][2], {
    message: 'inner_async_context',
    extra: {
      aa: 'aa',
      bb: 'bb',
      cc: 'cc',
      dd: 'dd',
      ff: 'ff',
      gg: 'gg',
    },
  });

  assertSentryEvent(events[3][2], {
    message: 'outer_after',
    extra: {
      aa: 'aa',
      bb: 'bb',
      cc: 'cc',
      dd: 'dd',
    },
  });
});
