import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  expectedCLSPerformanceSpan,
  expectedClickBreadcrumb,
  expectedFCPPerformanceSpan,
  expectedFIDPerformanceSpan,
  expectedFPPerformanceSpan,
  expectedLCPPerformanceSpan,
  expectedMemoryPerformanceSpan,
  expectedNavigationBreadcrumb,
  expectedNavigationPerformanceSpan,
  expectedNavigationPushPerformanceSpan,
  expectedReloadPerformanceSpan,
  getExpectedReplayEvent,
} from '../../../utils/replayEventTemplates';
import {
  getReplayEvent,
  getReplayRecordingContent,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

/*
This is a quite complex test with the goal to ensure correct recording across multiple pages,
navigations and page reloads. In particular, we want to check that all breadcrumbs, spans as
well as the correct DOM snapshots and updates are recorded and sent.
*/
sentryTest(
  'record page navigations and performance entries across multiple pages',
  async ({ getLocalTestPath, page, browserName }) => {
    // We only test this against the NPM package and replay bundles
    // and only on chromium as most performance entries are only available in chromium
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);
    const reqPromise2 = waitForReplayRequest(page, 2);
    const reqPromise3 = waitForReplayRequest(page, 3);
    const reqPromise4 = waitForReplayRequest(page, 4);
    const reqPromise5 = waitForReplayRequest(page, 5);
    const reqPromise6 = waitForReplayRequest(page, 6);
    const reqPromise7 = waitForReplayRequest(page, 7);
    const reqPromise8 = waitForReplayRequest(page, 8);
    const reqPromise9 = waitForReplayRequest(page, 9);

    const url = await getLocalTestPath({ testDir: __dirname });

    const [req0] = await Promise.all([reqPromise0, page.goto(url)]);
    const replayEvent0 = getReplayEvent(req0);
    const recording0 = getReplayRecordingContent(req0);

    expect(replayEvent0).toEqual(getExpectedReplayEvent({ segment_id: 0 }));
    expect(normalize(recording0.fullSnapshots)).toMatchSnapshot('seg-0-snap-full');
    expect(recording0.incrementalSnapshots.length).toEqual(0);

    const [req1] = await Promise.all([reqPromise1, page.locator('#go-background').click()]);

    const replayEvent1 = getReplayEvent(req1);
    const recording1 = getReplayRecordingContent(req1);

    expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));
    expect(recording1.fullSnapshots.length).toEqual(0);
    expect(normalize(recording1.incrementalSnapshots)).toMatchSnapshot('seg-1-snap-incremental');

    // We can't guarantee the order of the performance spans, or in which of the two segments they are sent
    // So to avoid flakes, we collect them all and check that they are all there
    const collectedPerformanceSpans = [...recording0.performanceSpans, ...recording1.performanceSpans];
    const collectedBreadcrumbs = [...recording0.breadcrumbs, ...recording1.breadcrumbs];

    expect(collectedPerformanceSpans.length).toEqual(8);
    expect(collectedPerformanceSpans).toEqual(
      expect.arrayContaining([
        expectedNavigationPerformanceSpan,
        expectedLCPPerformanceSpan,
        expectedCLSPerformanceSpan,
        expectedFIDPerformanceSpan,
        expectedFPPerformanceSpan,
        expectedFCPPerformanceSpan,
        expectedMemoryPerformanceSpan, // two memory spans - once per flush
        expectedMemoryPerformanceSpan,
      ]),
    );

    expect(collectedBreadcrumbs).toEqual([expectedClickBreadcrumb]);

    // -----------------------------------------------------------------------------------------
    // Test page reload

    const [req2] = await Promise.all([reqPromise2, page.reload()]);

    const replayEvent2 = getReplayEvent(req2);
    const recording2 = getReplayRecordingContent(req2);

    expect(replayEvent2).toEqual(getExpectedReplayEvent({ segment_id: 2 }));
    expect(normalize(recording2.fullSnapshots)).toMatchSnapshot('seg-2-snap-full');
    expect(recording2.incrementalSnapshots.length).toEqual(0);

    const [req3] = await Promise.all([reqPromise3, page.locator('#go-background').click()]);

    const replayEvent3 = getReplayEvent(req3);
    const recording3 = getReplayRecordingContent(req3);

    expect(replayEvent3).toEqual(getExpectedReplayEvent({ segment_id: 3, urls: [] }));
    expect(recording3.fullSnapshots.length).toEqual(0);
    expect(normalize(recording3.incrementalSnapshots)).toMatchSnapshot('seg-3-snap-incremental');

    const collectedPerformanceSpansAfterReload = [...recording2.performanceSpans, ...recording3.performanceSpans];
    const collectedBreadcrumbsAdterReload = [...recording2.breadcrumbs, ...recording3.breadcrumbs];

    expect(collectedPerformanceSpansAfterReload.length).toEqual(8);
    expect(collectedPerformanceSpansAfterReload).toEqual(
      expect.arrayContaining([
        expectedReloadPerformanceSpan,
        expectedLCPPerformanceSpan,
        expectedCLSPerformanceSpan,
        expectedFIDPerformanceSpan,
        expectedFPPerformanceSpan,
        expectedFCPPerformanceSpan,
        expectedMemoryPerformanceSpan,
        expectedMemoryPerformanceSpan,
      ]),
    );

    expect(collectedBreadcrumbsAdterReload).toEqual([expectedClickBreadcrumb]);

    // -----------------------------------------------------------------------------------------
    // Test subsequent link navigation to another page

    const [req4] = await Promise.all([reqPromise4, page.locator('a').click()]);

    const replayEvent4 = getReplayEvent(req4);
    const recording4 = getReplayRecordingContent(req4);

    expect(replayEvent4).toEqual(
      getExpectedReplayEvent({
        segment_id: 4,
        // @ts-expect-error this is fine
        urls: [expect.stringContaining('page-0.html')],
        request: {
          // @ts-expect-error this is fine
          url: expect.stringContaining('page-0.html'),
          headers: {
            // @ts-expect-error this is fine
            'User-Agent': expect.stringContaining(''),
          },
        },
      }),
    );
    expect(normalize(recording4.fullSnapshots)).toMatchSnapshot('seg-4-snap-full');
    expect(recording4.incrementalSnapshots.length).toEqual(0);

    const [req5] = await Promise.all([reqPromise5, page.locator('#go-background').click()]);

    const replayEvent5 = getReplayEvent(req5);
    const recording5 = getReplayRecordingContent(req5);

    expect(replayEvent5).toEqual(
      getExpectedReplayEvent({
        segment_id: 5,
        urls: [],
        request: {
          // @ts-expect-error this is fine
          url: expect.stringContaining('page-0.html'),
          headers: {
            // @ts-expect-error this is fine
            'User-Agent': expect.stringContaining(''),
          },
        },
      }),
    );
    expect(recording5.fullSnapshots.length).toEqual(0);
    expect(normalize(recording5.incrementalSnapshots)).toMatchSnapshot('seg-5-snap-incremental');

    const collectedPerformanceSpansAfterLinkNavigation = [
      ...recording4.performanceSpans,
      ...recording5.performanceSpans,
    ];
    const collectedBreadcrumbsAfterLinkNavigation = [...recording4.breadcrumbs, ...recording5.breadcrumbs];

    expect(collectedPerformanceSpansAfterLinkNavigation).toEqual(
      expect.arrayContaining([
        expectedNavigationPerformanceSpan,
        expectedLCPPerformanceSpan,
        expectedCLSPerformanceSpan,
        expectedFIDPerformanceSpan,
        expectedFPPerformanceSpan,
        expectedFCPPerformanceSpan,
        expectedMemoryPerformanceSpan,
        expectedMemoryPerformanceSpan,
      ]),
    );

    expect(collectedBreadcrumbsAfterLinkNavigation.length).toEqual(1);
    expect(collectedBreadcrumbsAfterLinkNavigation).toEqual([expectedClickBreadcrumb]);

    // -----------------------------------------------------------------------------------------
    // Test subsequent navigation without a page reload (i.e. SPA navigation)

    const [req6] = await Promise.all([reqPromise6, page.locator('#spa-navigation').click()]);

    const replayEvent6 = getReplayEvent(req6);
    const recording6 = getReplayRecordingContent(req6);

    expect(replayEvent6).toEqual(
      getExpectedReplayEvent({
        segment_id: 6,
        urls: ['/spa'],

        request: {
          // @ts-expect-error this is fine
          url: expect.stringContaining('page-0.html'),
          headers: {
            // @ts-expect-error this is fine
            'User-Agent': expect.stringContaining(''),
          },
        },
      }),
    );
    expect(recording6.fullSnapshots.length).toEqual(0);
    expect(normalize(recording6.incrementalSnapshots)).toMatchSnapshot('seg-6-snap-incremental');

    const [req7] = await Promise.all([reqPromise7, page.locator('#go-background').click()]);

    const replayEvent7 = getReplayEvent(req7);
    const recording7 = getReplayRecordingContent(req7);

    expect(replayEvent7).toEqual(
      getExpectedReplayEvent({
        segment_id: 7,
        urls: [],

        request: {
          // @ts-expect-error this is fine
          url: expect.stringContaining('page-0.html'),
          headers: {
            // @ts-expect-error this is fine
            'User-Agent': expect.stringContaining(''),
          },
        },
      }),
    );
    expect(recording7.fullSnapshots.length).toEqual(0);
    expect(normalize(recording7.incrementalSnapshots)).toMatchSnapshot('seg-7-snap-incremental');

    const collectedPerformanceSpansAfterSPANavigation = [
      ...recording6.performanceSpans,
      ...recording7.performanceSpans,
    ];
    const collectedBreadcrumbsAfterSPANavigation = [...recording6.breadcrumbs, ...recording7.breadcrumbs];

    expect(collectedPerformanceSpansAfterSPANavigation.length).toEqual(3);
    expect(collectedPerformanceSpansAfterSPANavigation).toEqual(
      expect.arrayContaining([
        expectedNavigationPushPerformanceSpan,
        expectedMemoryPerformanceSpan,
        expectedMemoryPerformanceSpan,
      ]),
    );

    expect(collectedBreadcrumbsAfterSPANavigation).toEqual([
      expectedClickBreadcrumb,
      expectedNavigationBreadcrumb,
      expectedClickBreadcrumb,
    ]);

    //   // -----------------------------------------------------------------------------------------
    //   // And just to finish this off, let's go back to the index page

    const [req8] = await Promise.all([reqPromise8, page.locator('a').click()]);

    const replayEvent8 = getReplayEvent(req8);
    const recording8 = getReplayRecordingContent(req8);

    expect(replayEvent8).toEqual(
      getExpectedReplayEvent({
        segment_id: 8,
      }),
    );
    expect(normalize(recording8.fullSnapshots)).toMatchSnapshot('seg-8-snap-full');
    expect(recording8.incrementalSnapshots.length).toEqual(0);

    const [req9] = await Promise.all([reqPromise9, page.locator('#go-background').click()]);

    const replayEvent9 = getReplayEvent(req9);
    const recording9 = getReplayRecordingContent(req9);

    expect(replayEvent9).toEqual(
      getExpectedReplayEvent({
        segment_id: 9,
        urls: [],
      }),
    );
    expect(recording9.fullSnapshots.length).toEqual(0);
    expect(normalize(recording9.incrementalSnapshots)).toMatchSnapshot('seg-9-snap-incremental');

    const collectedPerformanceSpansAfterIndexNavigation = [
      ...recording8.performanceSpans,
      ...recording9.performanceSpans,
    ];
    const collectedBreadcrumbsAfterIndexNavigation = [...recording8.breadcrumbs, ...recording9.breadcrumbs];

    expect(collectedPerformanceSpansAfterIndexNavigation.length).toEqual(8);
    expect(collectedPerformanceSpansAfterIndexNavigation).toEqual(
      expect.arrayContaining([
        expectedNavigationPerformanceSpan,
        expectedLCPPerformanceSpan,
        expectedCLSPerformanceSpan,
        expectedFIDPerformanceSpan,
        expectedFPPerformanceSpan,
        expectedFCPPerformanceSpan,
        expectedMemoryPerformanceSpan,
        expectedMemoryPerformanceSpan,
      ]),
    );

    expect(collectedBreadcrumbsAfterIndexNavigation).toEqual([expectedClickBreadcrumb]);
  },
);
