import { describe, expectTypeOf, it } from 'vitest';
import type { SentryHandleRequestOptions } from '../../src/server/createSentryHandleRequest';
import type { SentryWebStreamHandleRequestOptions } from '../../src/server/handleRequestTypes';

describe('handleRequest options', () => {
  it('keeps the Node-specific options required', () => {
    expectTypeOf<SentryHandleRequestOptions>().toHaveProperty('renderToPipeableStream');
    expectTypeOf<SentryHandleRequestOptions>().toHaveProperty('createReadableStreamFromReadable');
    expectTypeOf<undefined>().not.toExtend<SentryHandleRequestOptions['renderToPipeableStream']>();
    expectTypeOf<undefined>().not.toExtend<SentryHandleRequestOptions['createReadableStreamFromReadable']>();
  });

  it('keeps the shared options optional except ServerRouter', () => {
    expectTypeOf<{ ServerRouter: SentryHandleRequestOptions['ServerRouter'] }>().toExtend<
      Pick<SentryHandleRequestOptions, 'ServerRouter'>
    >();
    expectTypeOf<Pick<SentryHandleRequestOptions, 'streamTimeout' | 'botRegex' | 'getNonce'>>().toEqualTypeOf<
      Partial<Pick<SentryHandleRequestOptions, 'streamTimeout' | 'botRegex' | 'getNonce'>>
    >();
  });

  it('shares the same base options between the Node and Web Streams handlers', () => {
    expectTypeOf<SentryHandleRequestOptions['ServerRouter']>().toEqualTypeOf<
      SentryWebStreamHandleRequestOptions['ServerRouter']
    >();
    expectTypeOf<SentryHandleRequestOptions['getNonce']>().toEqualTypeOf<
      SentryWebStreamHandleRequestOptions['getNonce']
    >();
  });
});
