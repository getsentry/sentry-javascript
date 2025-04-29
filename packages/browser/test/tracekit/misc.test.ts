import { describe, expect, it } from 'vitest';
import { exceptionFromError } from '../../src/eventbuilder';
import { defaultStackParser as parser } from '../../src/stack-parsers';

describe('Tracekit - Misc Tests', () => {
  it('should parse PhantomJS 1.19 error', () => {
    const PHANTOMJS_1_19 = {
      name: 'foo',
      message: 'bar',
      stack:
        'Error: foo\n' +
        '    at file:///path/to/file.js:878\n' +
        '    at foo (http://path/to/file.js:4283)\n' +
        '    at http://path/to/file.js:4287',
    };
    const ex = exceptionFromError(parser, PHANTOMJS_1_19);

    expect(ex).toEqual({
      value: 'bar',
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: '?', lineno: 4287, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 4283, in_app: true },
          { filename: 'file:///path/to/file.js', function: '?', lineno: 878, in_app: true },
        ],
      },
    });
  });

  it('should parse SecurityError', () => {
    const SECURITY_ERROR = {
      name: 'SecurityError',
      message: 'Blocked a frame with origin "https://SENTRY_URL.sentry.io" from accessing a cross-origin frame.',
      stack:
        'SecurityError: Blocked a frame with origin "https://SENTRY_URL.sentry.io" from accessing a cross-origin frame.\n' +
        '   at Error: Blocked a frame with origin "(https://SENTRY_URL.sentry.io" from accessing a cross-origin frame.)\n' +
        '   at castFn(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js:368:76)\n' +
        '   at castFn(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js:409:17)\n' +
        '   at Replayer.applyEventsSynchronously(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js:325:13)\n' +
        '   at <object>.actions.play(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/machine.js:132:17)\n' +
        '   at <anonymous>(../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js:15:2595)\n' +
        '   at Array.forEach(<anonymous>)\n' +
        '   at l(../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js:15:2551)\n' +
        '   at c.send(../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js:15:2741)\n' +
        '   at Replayer.play(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js:220:26)\n' +
        '   at Replayer.pause(../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js:235:18)\n' +
        '   at playTimer.current(./app/components/replays/replayContext.tsx:397:62)\n' +
        '   at sentryWrapped(../node_modules/@sentry/browser/esm/helpers.js:90:17)',
    };
    const ex = exceptionFromError(parser, SECURITY_ERROR);

    expect(ex).toEqual({
      type: 'SecurityError',
      value: 'Blocked a frame with origin "https://SENTRY_URL.sentry.io" from accessing a cross-origin frame.',
      stacktrace: {
        frames: [
          {
            filename: './app/components/replays/replayContext.tsx',
            function: 'playTimer.current',
            in_app: true,
            lineno: 397,
            colno: 62,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js',
            function: 'Replayer.pause',
            in_app: true,
            lineno: 235,
            colno: 18,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js',
            function: 'Replayer.play',
            in_app: true,
            lineno: 220,
            colno: 26,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js',
            function: 'c.send',
            in_app: true,
            lineno: 15,
            colno: 2741,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js',
            function: 'l',
            in_app: true,
            lineno: 15,
            colno: 2551,
          },
          { filename: '<anonymous>', function: 'Array.forEach', in_app: true },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/ext/@xstate/fsm/es/index.js',
            function: '?',
            in_app: true,
            lineno: 15,
            colno: 2595,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/machine.js',
            function: '<object>.actions.play',
            in_app: true,
            lineno: 132,
            colno: 17,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js',
            function: 'Replayer.applyEventsSynchronously',
            in_app: true,
            lineno: 325,
            colno: 13,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js',
            function: 'castFn',
            in_app: true,
            lineno: 409,
            colno: 17,
          },
          {
            filename: '../node_modules/@sentry-internal/rrweb/es/rrweb/packages/rrweb/src/replay/index.js',
            function: 'castFn',
            in_app: true,
            lineno: 368,
            colno: 76,
          },
        ],
      },
    });
  });
});
