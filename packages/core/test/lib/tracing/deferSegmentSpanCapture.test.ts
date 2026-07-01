import { afterEach, describe, expect, it, vi } from 'vitest';
import { _INTERNAL_setDeferSegmentSpanCapture } from '../../../src/tracing/deferSegmentSpanCapture';
import {
  getSegmentSpanCaptureStrategy,
  setSegmentSpanCaptureStrategy,
} from '../../../src/tracing/segmentSpanCaptureStrategy';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('_INTERNAL_setDeferSegmentSpanCapture', () => {
  afterEach(() => {
    setSegmentSpanCaptureStrategy(undefined);
  });

  it('registers the global capture strategy', () => {
    expect(getSegmentSpanCaptureStrategy()).toBeUndefined();

    _INTERNAL_setDeferSegmentSpanCapture(new TestClient(getDefaultTestClientOptions()));

    expect(getSegmentSpanCaptureStrategy()).toBeDefined();
  });

  it('registers the flush listener once and is idempotent on repeated enable', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const onSpy = vi.spyOn(client, 'on');

    _INTERNAL_setDeferSegmentSpanCapture(client);
    _INTERNAL_setDeferSegmentSpanCapture(client);

    expect(onSpy.mock.calls.filter(([hook]) => hook === 'flush')).toHaveLength(1);
  });
});
