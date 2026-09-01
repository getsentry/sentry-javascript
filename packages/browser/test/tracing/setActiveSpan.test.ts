import { getActiveSpan, SentrySpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { setActiveSpanInBrowser } from '../../src';

describe('setActiveSpanInBrowser', () => {
  it('sets the passed span active the current scope', () => {
    const span = new SentrySpan({ name: 'test' });
    setActiveSpanInBrowser(span);
    expect(getActiveSpan()).toBe(span);

    span.end();
    expect(getActiveSpan()).toBeUndefined();
  });

  it('handles multiple calls to setActiveSpanInBrowser', () => {
    const span = new SentrySpan({ name: 'test' });
    setActiveSpanInBrowser(span);
    setActiveSpanInBrowser(span);
    setActiveSpanInBrowser(span);
    expect(getActiveSpan()).toBe(span);

    span.end();
    expect(getActiveSpan()).toBeUndefined();
  });

  it('handles changing active span while span is running', () => {
    const span = new SentrySpan({ name: 'test' });
    setActiveSpanInBrowser(span);

    expect(getActiveSpan()).toBe(span);

    const span2 = new SentrySpan({ name: 'test2' });
    setActiveSpanInBrowser(span2);
    expect(getActiveSpan()).toBe(span2);

    span2.end();
    expect(getActiveSpan()).toBe(span);

    span.end();
    expect(getActiveSpan()).toBeUndefined();
  });

  it('handles multiple span.end calls', () => {
    const span = new SentrySpan({ name: 'test' });
    setActiveSpanInBrowser(span);
    setActiveSpanInBrowser(span);

    expect(getActiveSpan()).toBe(span);

    const span2 = new SentrySpan({ name: 'test2' });
    setActiveSpanInBrowser(span2);
    expect(getActiveSpan()).toBe(span2);

    span2.end();
    span2.end();
    span2.end();
    expect(getActiveSpan()).toBe(span);

    span.end();
    span.end();
    expect(getActiveSpan()).toBeUndefined();
  });

  it('handles nested activation of the same span', () => {
    const span1 = new SentrySpan({ name: 'test1', sampled: true });
    const span2 = new SentrySpan({ name: 'test2', sampled: true });
    expect(span1.isRecording()).toBe(true);
    expect(span2.isRecording()).toBe(true);

    setActiveSpanInBrowser(span1);
    expect(getActiveSpan()).toBe(span1);

    setActiveSpanInBrowser(span2);
    expect(getActiveSpan()).toBe(span2);

    setActiveSpanInBrowser(span1);
    expect(getActiveSpan()).toBe(span1);

    span2.end();
    expect(getActiveSpan()).toBe(span1);
    expect(span2.isRecording()).toBe(false);
    expect(span1.isRecording()).toBe(true);

    span1.end();
    expect(getActiveSpan()).toBeUndefined();

    expect(span1.isRecording()).toBe(false);
    expect(span2.isRecording()).toBe(false);
  });
});
