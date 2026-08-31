import { describe, expect, it } from 'vitest';
import type { Event } from '../../../../src/types/event';
import {
  DEFAULT_IGNORE_STATUS_CODES,
  processHttpServerTransactionEvent,
  shouldFilterStatusCode,
} from '../../../../src/integrations/http/server-transaction-event';

function transaction(statusCode?: number, contexts: Record<string, unknown> = {}): Event {
  return {
    type: 'transaction',
    contexts: {
      ...contexts,
      trace: { data: statusCode === undefined ? {} : { 'http.response.status_code': statusCode } },
    },
  } as Event;
}

describe('shouldFilterStatusCode', () => {
  it('matches plain status codes', () => {
    expect(shouldFilterStatusCode(404, [404])).toBe(true);
    expect(shouldFilterStatusCode(500, [404])).toBe(false);
  });

  it('matches inclusive ranges', () => {
    expect(shouldFilterStatusCode(300, [[300, 399]])).toBe(true);
    expect(shouldFilterStatusCode(399, [[300, 399]])).toBe(true);
    expect(shouldFilterStatusCode(400, [[300, 399]])).toBe(false);
  });

  it('matches a mix of codes and ranges', () => {
    expect(shouldFilterStatusCode(404, [[300, 399], 404])).toBe(true);
  });

  it('never matches on an empty list', () => {
    expect(shouldFilterStatusCode(404, [])).toBe(false);
  });

  it.each([
    [300, false],
    [301, true],
    [303, true],
    [304, false],
    [305, true],
    [399, true],
    [401, true],
    [404, true],
    [405, false],
    [200, false],
    [500, false],
  ])('applies the default list correctly to %i', (statusCode, expected) => {
    expect(shouldFilterStatusCode(statusCode, DEFAULT_IGNORE_STATUS_CODES)).toBe(expected);
  });
});

describe('processHttpServerTransactionEvent', () => {
  it('drops transactions whose status code is ignored', () => {
    expect(processHttpServerTransactionEvent(transaction(404), [404])).toBeNull();
  });

  it('lifts the status code into the top-level `response` context', () => {
    const event = processHttpServerTransactionEvent(transaction(200), []);
    expect(event?.contexts?.response).toEqual({ status_code: 200 });
  });

  it('preserves existing `response` context fields', () => {
    const event = processHttpServerTransactionEvent(transaction(201, { response: { body_size: 42 } }), []);
    expect(event?.contexts?.response).toEqual({ body_size: 42, status_code: 201 });
  });

  it('leaves the event untouched when there is no status code', () => {
    const event = processHttpServerTransactionEvent(transaction(undefined), []);
    expect(event?.contexts?.response).toBeUndefined();
  });

  it('ignores events from a different span origin when spanOrigin is given', () => {
    const event = {
      ...transaction(404),
      contexts: { trace: { origin: 'auto.http.deno', data: { 'http.response.status_code': 404 } } },
    } as Event;
    // Would be dropped without the gate; the origin does not match, so it passes through.
    expect(processHttpServerTransactionEvent(event, [404], 'auto.http.server')).toBe(event);
  });

  it('acts on events whose span origin matches', () => {
    const event = {
      ...transaction(404),
      contexts: { trace: { origin: 'auto.http.server', data: { 'http.response.status_code': 404 } } },
    } as Event;
    expect(processHttpServerTransactionEvent(event, [404], 'auto.http.server')).toBeNull();
  });

  it('acts on every origin when spanOrigin is omitted', () => {
    const event = {
      ...transaction(404),
      contexts: { trace: { origin: 'auto.http.deno', data: { 'http.response.status_code': 404 } } },
    } as Event;
    expect(processHttpServerTransactionEvent(event, [404])).toBeNull();
  });

  it('leaves non-transaction events untouched, even with an ignored status code', () => {
    const event = { type: undefined, contexts: { trace: { data: { 'http.response.status_code': 404 } } } } as Event;
    expect(processHttpServerTransactionEvent(event, [404])).toBe(event);
  });
});
