import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'adds element timing spans to pageload span tree for elements rendered during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const pageloadEventPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const eventData = envelopeRequestParser(await pageloadEventPromise);

    const elementTimingSpans = eventData.spans?.filter(({ op }) => op === 'ui.elementtiming');

    expect(elementTimingSpans?.length).toEqual(8);

    // Check image-fast span (this is served with a 100ms delay)
    const imageFastSpan = elementTimingSpans?.find(({ description }) => description === 'element[image-fast]');
    const imageFastRenderTime = imageFastSpan?.data['element.render-time'];
    const imageFastLoadTime = imageFastSpan?.data['element.load-time'];
    const duration = imageFastSpan!.timestamp! - imageFastSpan!.start_timestamp!;

    expect(imageFastSpan).toBeDefined();
    expect(imageFastSpan?.data).toEqual({
      'sentry.op': 'ui.elementtiming',
      'sentry.origin': 'auto.ui.browser.elementtiming',
      'sentry.source': 'component',
      'sentry.span-start-time-source': 'load-time',
      'element.identifier': 'image-fast',
      'element.type': 'img',
      'element.size': '600x179',
      'element.url': 'https://sentry-test-site.example/path/to/image-fast.png',
      'element.render-time': expect.any(Number),
      'element.load-time': expect.any(Number),
      'element.paint-type': 'image-paint',
      route: '/index.html',
    });
    expect(imageFastRenderTime).toBeGreaterThan(90);
    expect(imageFastRenderTime).toBeLessThan(400);
    expect(imageFastLoadTime).toBeGreaterThan(90);
    expect(imageFastLoadTime).toBeLessThan(400);
    expect(imageFastRenderTime).toBeGreaterThan(imageFastLoadTime as number);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(20);

    // Check text1 span
    const text1Span = elementTimingSpans?.find(({ data }) => data?.['element.identifier'] === 'text1');
    const text1RenderTime = text1Span?.data['element.render-time'];
    const text1LoadTime = text1Span?.data['element.load-time'];
    const text1Duration = text1Span!.timestamp! - text1Span!.start_timestamp!;
    expect(text1Span).toBeDefined();
    expect(text1Span?.data).toEqual({
      'sentry.op': 'ui.elementtiming',
      'sentry.origin': 'auto.ui.browser.elementtiming',
      'sentry.source': 'component',
      'sentry.span-start-time-source': 'render-time',
      'element.identifier': 'text1',
      'element.type': 'p',
      'element.render-time': expect.any(Number),
      'element.load-time': expect.any(Number),
      'element.paint-type': 'text-paint',
      route: '/index.html',
    });
    expect(text1RenderTime).toBeGreaterThan(0);
    expect(text1RenderTime).toBeLessThan(300);
    expect(text1LoadTime).toBe(0);
    expect(text1RenderTime).toBeGreaterThan(text1LoadTime as number);
    expect(text1Duration).toBe(0);

    // Check button1 span (no need for a full assertion)
    const button1Span = elementTimingSpans?.find(({ data }) => data?.['element.identifier'] === 'button1');
    expect(button1Span).toBeDefined();
    expect(button1Span?.data).toMatchObject({
      'element.identifier': 'button1',
      'element.type': 'button',
      'element.paint-type': 'text-paint',
      route: '/index.html',
    });

    // Check image-slow span
    const imageSlowSpan = elementTimingSpans?.find(({ data }) => data?.['element.identifier'] === 'image-slow');
    expect(imageSlowSpan).toBeDefined();
    expect(imageSlowSpan?.data).toEqual({
      'element.identifier': 'image-slow',
      'element.type': 'img',
      'element.size': '600x179',
      'element.url': 'https://sentry-test-site.example/path/to/image-slow.png',
      'element.paint-type': 'image-paint',
      'element.render-time': expect.any(Number),
      'element.load-time': expect.any(Number),
      'sentry.op': 'ui.elementtiming',
      'sentry.origin': 'auto.ui.browser.elementtiming',
      'sentry.source': 'component',
      'sentry.span-start-time-source': 'load-time',
      route: '/index.html',
    });
    const imageSlowRenderTime = imageSlowSpan?.data['element.render-time'];
    const imageSlowLoadTime = imageSlowSpan?.data['element.load-time'];
    const imageSlowDuration = imageSlowSpan!.timestamp! - imageSlowSpan!.start_timestamp!;
    expect(imageSlowRenderTime).toBeGreaterThan(1400);
    expect(imageSlowRenderTime).toBeLessThan(2000);
    expect(imageSlowLoadTime).toBeGreaterThan(1400);
    expect(imageSlowLoadTime).toBeLessThan(2000);
    expect(imageSlowDuration).toBeGreaterThan(0);
    expect(imageSlowDuration).toBeLessThan(20);

    // Check lazy-image span
    const lazyImageSpan = elementTimingSpans?.find(({ data }) => data?.['element.identifier'] === 'lazy-image');
    expect(lazyImageSpan).toBeDefined();
    expect(lazyImageSpan?.data).toEqual({
      'element.identifier': 'lazy-image',
      'element.type': 'img',
      'element.size': '600x179',
      'element.url': 'https://sentry-test-site.example/path/to/image-lazy.png',
      'element.paint-type': 'image-paint',
      'element.render-time': expect.any(Number),
      'element.load-time': expect.any(Number),
      'sentry.op': 'ui.elementtiming',
      'sentry.origin': 'auto.ui.browser.elementtiming',
      'sentry.source': 'component',
      'sentry.span-start-time-source': 'load-time',
      route: '/index.html',
    });
    const lazyImageRenderTime = lazyImageSpan?.data['element.render-time'];
    const lazyImageLoadTime = lazyImageSpan?.data['element.load-time'];
    const lazyImageDuration = lazyImageSpan!.timestamp! - lazyImageSpan!.start_timestamp!;
    expect(lazyImageRenderTime).toBeGreaterThan(1000);
    expect(lazyImageRenderTime).toBeLessThan(1500);
    expect(lazyImageLoadTime).toBeGreaterThan(1000);
    expect(lazyImageLoadTime).toBeLessThan(1500);
    expect(lazyImageDuration).toBeGreaterThan(0);
    expect(lazyImageDuration).toBeLessThan(20);

    // Check lazy-text span
    const lazyTextSpan = elementTimingSpans?.find(({ data }) => data?.['element.identifier'] === 'lazy-text');
    expect(lazyTextSpan?.data).toMatchObject({
      'element.identifier': 'lazy-text',
      'element.type': 'p',
      route: '/index.html',
    });
    const lazyTextRenderTime = lazyTextSpan?.data['element.render-time'];
    const lazyTextLoadTime = lazyTextSpan?.data['element.load-time'];
    const lazyTextDuration = lazyTextSpan!.timestamp! - lazyTextSpan!.start_timestamp!;
    expect(lazyTextRenderTime).toBeGreaterThan(1000);
    expect(lazyTextRenderTime).toBeLessThan(1500);
    expect(lazyTextLoadTime).toBe(0);
    expect(lazyTextDuration).toBe(0);

    // the div1 entry does not emit an elementTiming entry because it's neither a text nor an image
    expect(elementTimingSpans?.find(({ description }) => description === 'element[div1]')).toBeUndefined();
  },
);

sentryTest('emits element timing spans on navigation', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipTracingTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  serveAssets(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const pageloadEventPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');

  const navigationEventPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');

  await pageloadEventPromise;

  await page.locator('#button1').click();

  const navigationTransactionEvent = envelopeRequestParser(await navigationEventPromise);
  const pageloadTransactionEvent = envelopeRequestParser(await pageloadEventPromise);

  const navigationElementTimingSpans = navigationTransactionEvent.spans?.filter(({ op }) => op === 'ui.elementtiming');

  expect(navigationElementTimingSpans?.length).toEqual(2);

  const navigationStartTime = navigationTransactionEvent.start_timestamp!;
  const pageloadStartTime = pageloadTransactionEvent.start_timestamp!;

  const imageSpan = navigationElementTimingSpans?.find(
    ({ description }) => description === 'element[navigation-image]',
  );
  const textSpan = navigationElementTimingSpans?.find(({ description }) => description === 'element[navigation-text]');

  // Image started loading after navigation, but render-time and load-time still start from the time origin
  // of the pageload. This is somewhat a limitation (though by design according to the ElementTiming spec)
  expect((imageSpan!.data['element.render-time']! as number) / 1000 + pageloadStartTime).toBeGreaterThan(
    navigationStartTime,
  );
  expect((imageSpan!.data['element.load-time']! as number) / 1000 + pageloadStartTime).toBeGreaterThan(
    navigationStartTime,
  );

  expect(textSpan?.data['element.load-time']).toBe(0);
  expect((textSpan!.data['element.render-time']! as number) / 1000 + pageloadStartTime).toBeGreaterThan(
    navigationStartTime,
  );
});
