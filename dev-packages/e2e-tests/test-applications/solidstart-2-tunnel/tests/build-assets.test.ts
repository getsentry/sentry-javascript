import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

// This app runs under a base path (`/app/`), so it also tests the build file filter with a base path.
const BUILD_FILE_PATH = '/app/_build/assets/entry.js.map';
const PAGE_PATH = '/app/after-build-file';

// In development, the server SDK does not know the base path when it initializes.
test.skip(process.env.TEST_ENV === 'development', 'Production only');

test('does not send a server span for a build file under the base path', async ({ baseURL }) => {
  const segmentPaths: string[] = [];
  const pageSegmentPromise = waitForStreamedSpans('solidstart-2-tunnel', spans => {
    segmentPaths.push(
      ...spans
        .filter(span => span.is_segment && getSpanOp(span) === 'http.server')
        .map(span => `${span.attributes['url.path']?.value}`),
    );
    return segmentPaths.includes(PAGE_PATH);
  });

  await fetch(`${baseURL}${BUILD_FILE_PATH}`);
  // A span for the build file would arrive before the span of this later request.
  await fetch(`${baseURL}${PAGE_PATH}`);
  await pageSegmentPromise;

  expect(segmentPaths).not.toContain(BUILD_FILE_PATH);
});
