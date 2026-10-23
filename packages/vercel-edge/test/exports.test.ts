import { SentrySpan } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getIsolationScope,
  growthbookIntegration,
  instrumentCreateReactAgent,
  setConversationId,
  updateSpanName,
} from '../src';

afterEach(() => {
  setConversationId(null);
});

describe('portable exports', () => {
  it('sets the conversation context through the public entry point', () => {
    setConversationId('edge-conversation');

    expect(getIsolationScope().getScopeData().conversationId).toBe('edge-conversation');
  });

  it('updates a span name through the public entry point', () => {
    const span = new SentrySpan({ name: 'original' });
    updateSpanName(span, 'renamed');
    expect(span.getSpanJSON().name).toBe('renamed');
    span.end();
  });

  it('creates the GrowthBook integration through the public entry point', () => {
    class GrowthBook {
      public isOn(): boolean {
        return true;
      }
      public getFeatureValue(): unknown {
        return false;
      }
    }

    expect(growthbookIntegration({ growthbookClass: GrowthBook }).name).toBe('GrowthBook');
  });

  it('wraps a React agent factory and preserves its result', () => {
    const graph = {};
    const createAgent = instrumentCreateReactAgent(() => graph);

    expect(createAgent()).toBe(graph);
  });
});
