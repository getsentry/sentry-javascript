import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  'should attach tracing headers to requests whose casing differs from tracePropagationTargets',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, stringTargetRequest, regexTargetRequest, noMatchRequest] = await Promise.all([
      page.goto(url),
      page.waitForRequest('http://sentry-test-site.example/string/0'),
      page.waitForRequest('http://sentry-test-site.example/REGEX/1'),
      page.waitForRequest('http://sentry-test-site.example/no-match/2'),
    ]);

    expect(stringTargetRequest.headers()).toMatchObject({
      'sentry-trace': expect.any(String),
      baggage: expect.any(String),
    });

    expect(regexTargetRequest.headers()).toMatchObject({
      'sentry-trace': expect.any(String),
      baggage: expect.any(String),
    });

    const noMatchHeaders = noMatchRequest.headers();
    expect(noMatchHeaders['sentry-trace']).toBeUndefined();
    expect(noMatchHeaders['baggage']).toBeUndefined();
  },
);
