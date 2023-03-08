import type { StackFrame } from '@sentry/types';
import * as fs from 'fs';

import { parseStackFrames } from '../src/eventbuilder';
import { ContextLines, resetFileContentCache } from '../src/integrations/contextlines';
import { defaultStackParser } from '../src/sdk';
import { getError } from './helper/error';

import * as Benchmark from 'benchmark';

const lines = new ContextLines({});

const source = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/requestdata.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/requestdata.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/sdk.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/stacktrace.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/utils.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/transports/http.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/test/transports/https.test.ts',
              lineno: 1,
              function: 'fxn1',
            },
            {
              colno: 1,
              filename: '/Users/jonasbadalic/code/sentry-javascript/packages/node/tsconfig.json',
              lineno: 1,
              function: 'fxn1',
            },
          ],
        },
      },
    ],
  },
};

const suite = new Benchmark.Suite({ setup: resetFileContentCache, teardown: resetFileContentCache });

suite
  .add('parallel io', async function () {
    await lines.addSourceContext(source);
    await lines.addSourceContext(source);
  })
  .on('cycle', function (event: any) {
    console.log(String(event.target));
  })
  .run({ async: true });
