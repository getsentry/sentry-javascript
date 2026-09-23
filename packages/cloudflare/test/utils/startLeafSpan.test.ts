import type { Event, Span } from '@sentry/core';
import { captureException, getActiveSpan, spanToJSON, startSpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { startLeafSpan } from '../../src/utils/startLeafSpan';
import { initTestClient } from '../testUtils';

describe('startLeafSpan', () => {
  it('creates a child of the active span and does not make itself active', () => {
    initTestClient();

    startSpan({ name: 'parent' }, parent => {
      const leaf = startLeafSpan({ name: 'leaf' }, span => {
        expect(getActiveSpan()).toBe(parent);
        expect(span.isRecording()).toBe(true);
        return span;
      });

      expect(spanToJSON(leaf).parent_span_id).toBe(parent.spanContext().spanId);
      expect(leaf.isRecording()).toBe(false);
      expect(spanToJSON(leaf).status).toBe(spanToJSON(startSpan({ name: 'reference' }, span => span)).status);
    });
  });

  it('ends the span when the returned promise settles', async () => {
    initTestClient();
    let resolve!: (value: string) => void;
    let leafSpan!: Span;

    const promise = startLeafSpan({ name: 'leaf' }, span => {
      leafSpan = span;
      return new Promise<string>(r => {
        resolve = r;
      });
    });

    expect(leafSpan.isRecording()).toBe(true);

    resolve('done');

    await expect(promise).resolves.toBe('done');
    expect(leafSpan.isRecording()).toBe(false);
  });

  it.each([
    [
      'a sync throw',
      () => {
        throw new Error('boom');
      },
    ],
    ['a rejected promise', () => Promise.reject(new Error('boom'))],
  ])('sets the same error status as startSpan and rethrows on %s', async (_label, callback) => {
    initTestClient();
    let leafSpan!: Span;
    let referenceSpan!: Span;

    await expect(
      (async () =>
        startLeafSpan({ name: 'leaf' }, span => {
          leafSpan = span;
          return callback();
        }))(),
    ).rejects.toThrow('boom');
    await expect(
      (async () =>
        startSpan({ name: 'reference' }, span => {
          referenceSpan = span;
          return callback();
        }))(),
    ).rejects.toThrow('boom');

    expect(spanToJSON(leafSpan).status).toBe(spanToJSON(referenceSpan).status);
    expect(spanToJSON(leafSpan).status).not.toBe('ok');
    expect(leafSpan.isRecording()).toBe(false);
  });

  it('attributes a captured escaped error to the leaf span', () => {
    const events: Event[] = [];
    initTestClient({
      beforeSend: event => {
        events.push(event);
        return null;
      },
    });
    let leafSpanId: string | undefined;

    startSpan({ name: 'parent' }, () => {
      try {
        startLeafSpan({ name: 'leaf' }, span => {
          leafSpanId = span.spanContext().spanId;
          throw new Error('boom');
        });
      } catch (e) {
        captureException(e);
      }
    });

    expect(events[0]?.contexts?.trace?.span_id).toBe(leafSpanId);
  });
});
