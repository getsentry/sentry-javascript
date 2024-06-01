import { nextStackParser } from '@sentry/nextjs';
import { createStackParser } from '@sentry/utils';
import { exceptionFromError } from '../../../src/eventbuilder';
import { chromeStackLineParser, geckoStackLineParser, winjsStackLineParser } from '../../../src/stack-parsers';

const parser = createStackParser(nextStackParser, chromeStackLineParser, geckoStackLineParser, winjsStackLineParser);

describe('Tracekit - Next.js Tests', () => {
  it('should parse Next.js routes error', () => {
    const NEXT = {
      name: 'foo',
      message: "Unable to get property 'undef' of undefined or null reference",
      stack:
        "TypeError: Unable to get property 'undef' of undefined or null reference\n" +
        '    at http://localhost:3001/_next/static/chunks/app/[locale]/sentery-example-page/(default)/sub/page-3d428c1ba734e10f.js:1:126',
      description: "Unable to get property 'undef' of undefined or null reference",
      number: -2146823281,
    };

    const ex = exceptionFromError(parser, NEXT);

    expect(ex).toEqual({
      value: "Unable to get property 'undef' of undefined or null reference",
      type: 'foo',
      stacktrace: {
        frames: [
          {
            filename:
              'http://localhost:3001/_next/static/chunks/app/%5Blocale%5D/sentery-example-page/%28default%29/sub/page-3d428c1ba734e10f.js',
            function: '?',
            lineno: 1,
            colno: 126,
            in_app: true,
          },
        ],
      },
    });
  });
});
