import { nextStackParser } from '@sentry/nextjs';
import { createStackParser } from '@sentry/utils';
import { exceptionFromError } from '../../../src/eventbuilder';
import { chromeStackLineParser, geckoStackLineParser, winjsStackLineParser } from '../../../src/stack-parsers';

const parser = createStackParser(nextStackParser, chromeStackLineParser, geckoStackLineParser, winjsStackLineParser);

const urlPatterns = [
  [
    'http://localhost:3001/_next/static/chunks/app/[locale]/sentery-example-page/(default)/sub/page-3d428c1ba734e10f.js:1:126',
    'http://localhost:3001/_next/static/chunks/app/%5Blocale%5D/sentery-example-page/%28default%29/sub/page-3d428c1ba734e10f.js',
    1,
    126,
  ],
  ['http://example.com:1:126', 'http://example.com', 1, 126],
  ['http://example.com/path/to/resource:1:126', 'http://example.com/path/to/resource', 1, 126],
  [
    'http://example.com/path/to/[[locale]]/resource:1:126',
    'http://example.com/path/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  [
    'http://example.com/path/to/[[...locale]]/resource:1:126',
    'http://example.com/path/to/%5B%5B...locale%5D%5D/resource',
    1,
    126,
  ],
  [
    'http://example.com/path/[[locale]]/to/[[locale]]/resource:1:126',
    'http://example.com/path/%5B%5Blocale%5D%5D/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  ['http://example.com/path/to/resource?query=1:1:126', 'http://example.com/path/to/resource?query=1', 1, 126],
  ['https://example.com:1:126', 'https://example.com', 1, 126],
  ['https://example.com/path/to/resource:1:126', 'https://example.com/path/to/resource', 1, 126],
  [
    'https://example.com/path/to/[[locale]]/resource:1:126',
    'https://example.com/path/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  [
    'https://example.com/path/to/[[...locale]]/resource:1:126',
    'https://example.com/path/to/%5B%5B...locale%5D%5D/resource',
    1,
    126,
  ],
  [
    'https://example.com/path/[[locale]]/to/[[locale]]/resource:1:126',
    'https://example.com/path/%5B%5Blocale%5D%5D/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  ['https://example.com/path/to/resource?query=1:1:126', 'https://example.com/path/to/resource?query=1', 1, 126],
  ['http://example.com/path/[[locale]]:1:126', 'http://example.com/path/%5B%5Blocale%5D%5D', 1, 126],
  ['https://example.com/path/[[locale]]:1:126', 'https://example.com/path/%5B%5Blocale%5D%5D', 1, 126],
  ['http://example.com/path/to/[[locale]]/:1:126', 'http://example.com/path/to/%5B%5Blocale%5D%5D/', 1, 126],
  ['https://example.com/path/to/[[locale]]/:1:126', 'https://example.com/path/to/%5B%5Blocale%5D%5D/', 1, 126],
  ['http://example.com/(path/to/resource:1:126)', 'http://example.com/%28path/to/resource', 1, 126],
  ['https://example.com/(path/to/resource:1:126)', 'https://example.com/%28path/to/resource', 1, 126],
  ['http://example.com/path/to/resource:1:126', 'http://example.com/path/to/resource', 1, 126],
  ['(https://example.com/path/to/resource:1:126)', 'https://example.com/path/to/resource', 1, 126],
  ['http://192.168.1.1/:1:126', 'http://192.168.1.1/', 1, 126],
  ['http://192.168.1.1/path/to/resource:1:126', 'http://192.168.1.1/path/to/resource', 1, 126],
  ['http://sub.example.com:1:126', 'http://sub.example.com', 1, 126],
  ['http://sub.example.com/path/to/resource:1:126', 'http://sub.example.com/path/to/resource', 1, 126],
  ['http://example.com:8080:1:126', 'http://example.com:8080', 1, 126],
  ['http://example.com:8080/path/to/resource:1:126', 'http://example.com:8080/path/to/resource', 1, 126],
  ['http://example.com/path/to/resource#anchor:1:126', 'http://example.com/path/to/resource#anchor', 1, 126],
  ['http://example.com/path/to/re-source:1:126', 'http://example.com/path/to/re-source', 1, 126],
  ['http://example.com/path/to/re_source:1:126', 'http://example.com/path/to/re_source', 1, 126],
  ['http://example.com/path/to/re.source:1:126', 'http://example.com/path/to/re.source', 1, 126],
  ['http://example.com/path/(to)/resource:1:126', 'http://example.com/path/%28to%29/resource', 1, 126],
  ['http://example.com/(path)/to/resource:1:126', 'http://example.com/%28path%29/to/resource', 1, 126],
  [
    'http://example.com/path/to/[[locale]]/resource:1:126)',
    'http://example.com/path/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  [
    'http://example.com/path/to/resource[[locale]]:1:126',
    'http://example.com/path/to/resource%5B%5Blocale%5D%5D',
    1,
    126,
  ],
  [
    'http://example.com/path/to/resource[[...locale]]:1:126',
    'http://example.com/path/to/resource%5B%5B...locale%5D%5D',
    1,
    126,
  ],
  [
    'https://example.com/path/to/resource[[locale]]:1:126',
    'https://example.com/path/to/resource%5B%5Blocale%5D%5D',
    1,
    126,
  ],
  [
    'http://example.com/path/to/(resource)/[[locale]]:1:126',
    'http://example.com/path/to/%28resource%29/%5B%5Blocale%5D%5D',
    1,
    126,
  ],
  [
    'https://example.com/(path)/to/resource[[locale]]:1:126',
    'https://example.com/%28path%29/to/resource%5B%5Blocale%5D%5D',
    1,
    126,
  ],
  [
    'http://192.168.1.1/path/to/[[locale]]/resource:1:126',
    'http://192.168.1.1/path/to/%5B%5Blocale%5D%5D/resource',
    1,
    126,
  ],
  [
    'http://example.com/path/to/[[locale]]/resource#anchor:1:126',
    'http://example.com/path/to/%5B%5Blocale%5D%5D/resource#anchor',
    1,
    126,
  ],
];

describe('Tracekit - Next.js Tests', () => {
  it('should parse Next.js routes error', () => {
    urlPatterns.forEach(([url, transformedUrl, lineno, colno]) => {
      const NextError = {
        name: 'foo',
        message: "Unable to get property 'undef' of undefined or null reference",
        stack: "TypeError: Unable to get property 'undef' of undefined or null reference\n" + `    at ${url}`,
        description: "Unable to get property 'undef' of undefined or null reference",
        number: -2146823281,
      };

      const ex = exceptionFromError(parser, NextError);

      expect(ex).toEqual({
        value: "Unable to get property 'undef' of undefined or null reference",
        type: 'foo',
        stacktrace: {
          frames: [
            {
              filename: transformedUrl,
              function: '?',
              lineno: lineno,
              colno: colno,
              in_app: true,
            },
          ],
        },
      });
    });
  });
});
