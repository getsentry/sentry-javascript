/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entries from '../../src/performance/entries';
import { longTasksIntegration } from '../../src/performance/longTasks';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

describe('longTasksIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['tracks long tasks for normal user agents', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0', 1],
    ['does not track long tasks for bot user agents', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 0],
  ])('%s', (_name, userAgent, calls) => {
    const trackSpy = vi.spyOn(entries, 'startTrackingLongTasks').mockImplementation(() => {});
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);

    longTasksIntegration().setup?.(new TestClient(getDefaultClientOptions()));

    expect(trackSpy).toHaveBeenCalledTimes(calls);
  });
});
