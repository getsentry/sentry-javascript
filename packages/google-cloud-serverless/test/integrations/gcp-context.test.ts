import type { StreamedSpanJSON } from '@sentry/core';
import { describe, expect, test, vi } from 'vitest';
import { gcpContextIntegration } from '../../src/integrations/gcp-context';

const mockGetScopeData = vi.fn();

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    getCurrentScope: () => ({
      getScopeData: mockGetScopeData,
    }),
  };
});

describe('gcpContextIntegration', () => {
  function makeSpanJSON(): StreamedSpanJSON {
    return {
      name: 'test',
      span_id: 'abc',
      trace_id: 'def',
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {},
    };
  }

  test('maps CloudEvents context fields to segment span attributes', () => {
    mockGetScopeData.mockReturnValue({
      contexts: {
        'gcp.function.context': {
          type: 'google.cloud.pubsub.topic.v1.messagePublished',
          source: '//pubsub.googleapis.com/projects/my-project/topics/my-topic',
          id: 'evt-123',
          specversion: '1.0',
          time: '2024-01-01T00:00:00Z',
        },
      },
    });

    const integration = gcpContextIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'gcp.function.context.type': 'google.cloud.pubsub.topic.v1.messagePublished',
        'gcp.function.context.source': '//pubsub.googleapis.com/projects/my-project/topics/my-topic',
        'gcp.function.context.id': 'evt-123',
        'gcp.function.context.specversion': '1.0',
        'gcp.function.context.time': '2024-01-01T00:00:00Z',
      }),
    );
  });

  test('maps legacy CloudFunctions fields with snake_case attribute names', () => {
    mockGetScopeData.mockReturnValue({
      contexts: {
        'gcp.function.context': {
          eventId: 'evt-456',
          timestamp: '2024-01-01T00:00:00Z',
          eventType: 'providers/cloud.pubsub/eventTypes/topic.publish',
          resource: 'projects/my-project/topics/my-topic',
        },
      },
    });

    const integration = gcpContextIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'gcp.function.context.event_id': 'evt-456',
        'gcp.function.context.timestamp': '2024-01-01T00:00:00Z',
        'gcp.function.context.event_type': 'providers/cloud.pubsub/eventTypes/topic.publish',
        'gcp.function.context.resource': 'projects/my-project/topics/my-topic',
      }),
    );
  });

  test('skips non-string values', () => {
    mockGetScopeData.mockReturnValue({
      contexts: {
        'gcp.function.context': {
          type: 'some.event',
          resource: { service: 'pubsub', name: 'my-topic' },
          data: { payload: 'secret' },
        },
      },
    });

    const integration = gcpContextIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'gcp.function.context.type': 'some.event',
      }),
    );
    expect(span.attributes).not.toHaveProperty('gcp.function.context.resource');
    expect(span.attributes).not.toHaveProperty('gcp.function.context.data');
  });

  test('does nothing when no gcp context is set', () => {
    mockGetScopeData.mockReturnValue({ contexts: {} });

    const integration = gcpContextIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual({});
  });
});
