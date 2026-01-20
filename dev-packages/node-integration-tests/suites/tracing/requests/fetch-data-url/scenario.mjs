import * as Sentry from '@sentry/node';

async function run() {
  // Wrap in a transaction so we have a parent span for the fetch span
  await Sentry.startSpan({ name: 'test-span' }, async () => {
    // Fetch a data URL - this should create a span with sanitized URL
    const dataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQh';
    try {
      await fetch(dataUrl);
    } catch {
      // Data URL fetch might not be supported or might fail
      // The span should still be created and sanitized
    }
  });
}

run();
