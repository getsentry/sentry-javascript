import { describe, expect, it } from 'vitest';
import { init, spanStreamingIntegration } from '../src';
import type { Integration } from '@sentry/core';

describe('init', () => {
  it('adds spanStreamingIntegration when traceLifecycle is "stream"', () => {
    const client = init({ traceLifecycle: 'stream' });
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).toContain('SpanStreaming');
  });

  it('doesn\'t add spanStreamingIntegration when traceLifecycle is not "stream"', () => {
    const client = init({});
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).not.toContain('SpanStreaming');
  });

  it('adds spanStreaming integration even with custom defaultIntegrations', () => {
    const client = init({ traceLifecycle: 'stream', defaultIntegrations: [] });
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).toContain('SpanStreaming');
  });

  type MarkedIntegration = Integration & { _custom?: boolean };

  it("doesn't add spanStreamingIntegration if user added it manually", () => {
    const customSpanStreamingIntegration: MarkedIntegration = spanStreamingIntegration();
    customSpanStreamingIntegration._custom = true;

    const client = init({ traceLifecycle: 'stream', integrations: [customSpanStreamingIntegration] });
    const integrations = client?.getOptions().integrations.filter(i => i.name === 'SpanStreaming');

    expect(integrations?.length).toBe(1);
    expect((integrations?.[0] as MarkedIntegration)?._custom).toBe(true);
  });
});
