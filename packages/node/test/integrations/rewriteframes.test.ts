import { SentryEvent, StackFrame } from '@sentry/types';
import { RewriteFrames } from '../../src/integrations/pluggable/rewriteframes';

let rewriteFrames: RewriteFrames;
let messageEvent: SentryEvent;
let exceptionEvent: SentryEvent;

describe('RewriteFrames', () => {
  beforeEach(() => {
    messageEvent = {
      stacktrace: {
        frames: [
          {
            filename: '/some/file1.js',
          },
          {
            filename: '/some/file2.js',
          },
        ],
      },
    };
    exceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: '/some/file1.js',
                },
                {
                  filename: '/some/file2.js',
                },
              ],
            },
          },
        ],
      },
    };
  });

  describe('default iteratee appends `app:///` if frame starts with `/`', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames();
    });

    it('transforms messageEvent frames', async () => {
      const event = await rewriteFrames.process(messageEvent);
      expect(event.stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('transforms exceptionEvent frames', async () => {
      const event = await rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });
  });

  describe('can use custom iteratee', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames({
        iteratee: async (frame: StackFrame) => ({
          ...frame,
          function: 'whoops',
        }),
      });
    });

    it('transforms messageEvent frames', async () => {
      const event = await rewriteFrames.process(messageEvent);
      expect(event.stacktrace!.frames![0].filename).toEqual('/some/file1.js');
      expect(event.stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.stacktrace!.frames![1].filename).toEqual('/some/file2.js');
      expect(event.stacktrace!.frames![1].function).toEqual('whoops');
    });

    it('transforms exceptionEvent frames', async () => {
      const event = await rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('/some/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('/some/file2.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].function).toEqual('whoops');
    });
  });
});
