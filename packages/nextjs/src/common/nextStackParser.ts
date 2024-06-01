import { defaultStackLineParsers, defaultStackParser } from '@sentry/react';
import type { StackLineParser } from '@sentry/types';

// We should put it in the highest priority to make sure it will be executed first to handle the Next.js routes.
const highestPriority = defaultStackLineParsers.sort((a, b) => a[0] - b[0])[0][0] - 1;

/**
 * This stack parser is used to handle the special case of Next.js routes.
 * This case didn't be place in the default stack parser because the current regex logic is too complex to be maintained.
 * Therefore, add this parser here as a `polyfill` is better.
 */
export const nextStackParser: StackLineParser = [
  highestPriority,
  line => {
    /**
     * Pick the last segment as the filename.
     * e.g.
     * "    at http://localhost:3001/_next/static/chunks/a…page/(default)/sub/page-3d428c1ba734e10f.js:1:126" -> "http://localhost:3001/_next/static/chunks/a…page/(default)/sub/page-3d428c1ba734e10f.js:1:126"
     * */
    const waitForReplaceSegments = line.split(' ');

    // Keep the last segment as the filename and use it to replace the original filename at the end
    let waitForReplaceFilename = waitForReplaceSegments[waitForReplaceSegments.length - 1];

    // In this case, the filename is a URL. So we need to check if it is a valid URL.
    const fileUrlRegex = /^(\(?)(https?:\/\/[^/]+(\/(?:[^/[\]]+|\[\[?\.{0,3}locale\]?\])*)*)(\)?)$/;

    if (!fileUrlRegex.test(waitForReplaceFilename) || !waitForReplaceFilename) {
      return defaultStackParser(line)[0];
    }

    /**
     * Remove parentheses.
     * e.g.
     * "  (http://localhost:3001/_next/static/chunks/a…page/(default)/sub/page-3d428c1ba734e10f.js:1:126)" -> "http://localhost:3001/_next/static/chunks/a…page/(default)/sub/page-3d428c1ba734e10f.js:1:126"
     */
    waitForReplaceFilename = waitForReplaceFilename.replace(/^\s*\(|\)\s*$/g, '');

    const processedLine = line.replace(
      waitForReplaceFilename,
      /**
       * KEY PARTS: Replace special characters with their ASCII code
       * "    at http://localhost:3001/_next/static/chunks/app/[locale]/sentry-example-page/(default)/sub/page-3d428c1ba734e10f.js:1:126" ->
       * "    at http://localhost:3001/_next/static/chunks/app/%5Blocale%5D/sentry-example-page/(default)/sub/page-3d428c1ba734e10f.js:1:126"
       * This is used to avoid the URL being split from the `(default)` part.
       */
      waitForReplaceFilename.replace(/[()@[\]]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`),
    );

    return defaultStackParser(processedLine)[0];
  },
];
