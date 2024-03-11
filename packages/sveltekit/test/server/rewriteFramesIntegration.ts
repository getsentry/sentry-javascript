import { rewriteFramesIntegration } from '@sentry/browser';
import type { Event, StackFrame } from '@sentry/types';
import { basename } from '@sentry/utils';

import { rewriteFramesIteratee } from '../../src/server/rewriteFramesIntegration';
import type { GlobalWithSentryValues } from '../../src/vite/injectGlobalValues';

describe('rewriteFramesIteratee', () => {
  it('removes the module property from the frame', () => {
    const frame: StackFrame = {
      filename: '/some/path/to/server/chunks/3-ab34d22f.js',
      module: '3-ab34d22f.js',
    };

    const result = rewriteFramesIteratee(frame);

    expect(result).not.toHaveProperty('module');
  });

  it('does the same filename modification as the default RewriteFrames iteratee if no output dir is available', () => {
    const frame: StackFrame = {
      filename: '/some/path/to/server/chunks/3-ab34d22f.js',
      lineno: 1,
      colno: 1,
      module: '3-ab34d22f.js',
    };

    const originalRewriteFrames = rewriteFramesIntegration();
    const rewriteFrames = rewriteFramesIntegration({ iteratee: rewriteFramesIteratee });

    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [frame],
            },
          },
        ],
      },
    };

    const originalResult = originalRewriteFrames.processEvent?.(event, {}, {} as any);
    const result = rewriteFrames.processEvent?.(event, {}, {} as any) as Event;

    expect(result.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: 'app:///3-ab34d22f.js',
      lineno: 1,
      colno: 1,
    });

    expect(result).toStrictEqual(originalResult);
  });

  it.each([
    ['adapter-node', 'build', '/absolute/path/to/build/server/chunks/3-ab34d22f.js', 'app:///chunks/3-ab34d22f.js'],
    [
      'adapter-auto',
      '.svelte-kit/output',
      '/absolute/path/to/.svelte-kit/output/server/entries/pages/page.ts.js',
      'app:///entries/pages/page.ts.js',
    ],
  ])(
    'removes the absolut path to the server output dir, if the output dir is available (%s)',
    (_, outputDir, frameFilename, modifiedFilename) => {
      (globalThis as unknown as GlobalWithSentryValues).__sentry_sveltekit_output_dir = outputDir;

      const frame: StackFrame = {
        filename: frameFilename,
        lineno: 1,
        colno: 1,
        module: basename(frameFilename),
      };

      const result = rewriteFramesIteratee({ ...frame });

      expect(result).toStrictEqual({
        filename: modifiedFilename,
        lineno: 1,
        colno: 1,
      });

      delete (globalThis as unknown as GlobalWithSentryValues).__sentry_sveltekit_output_dir;
    },
  );
});
