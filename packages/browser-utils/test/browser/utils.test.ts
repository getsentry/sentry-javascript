import { getCurrentScope, getIsolationScope, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { beforeEach, describe, expect, it, test } from 'vitest';
import { extractNetworkProtocol, startAndEndSpan } from '../../src/metrics/utils';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

describe('startAndEndSpan()', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
  });

  it('creates a span with given properties', () => {
    const parentSpan = new SentrySpan({ name: 'test', sampled: true });
    const span = startAndEndSpan(parentSpan, 100, 200, {
      name: 'evaluation',
      op: 'script',
    })!;

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentrySpan);
    expect(spanToJSON(span).description).toBe('evaluation');
    expect(spanToJSON(span).op).toBe('script');
    expect(spanToJSON(span).op).toBe('script');
  });

  it('adjusts the start timestamp if child span starts before transaction', () => {
    const parentSpan = new SentrySpan({ name: 'test', startTimestamp: 123, sampled: true });
    const span = startAndEndSpan(parentSpan, 100, 200, {
      name: 'script.js',
      op: 'resource',
    })!;

    expect(span).toBeDefined();
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(100);
  });

  it('does not adjust start timestamp if child span starts after transaction', () => {
    const parentSpan = new SentrySpan({ name: 'test', startTimestamp: 123, sampled: true });
    const span = startAndEndSpan(parentSpan, 150, 200, {
      name: 'script.js',
      op: 'resource',
    })!;

    expect(span).toBeDefined();
    expect(spanToJSON(parentSpan).start_timestamp).not.toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(123);
  });
});

describe('HTTPTimings', () => {
  test.each([
    ['http/0.9', { name: 'http', version: '0.9' }],
    ['http/1.0', { name: 'http', version: '1.0' }],
    ['http/1.1', { name: 'http', version: '1.1' }],
    ['spdy/1', { name: 'spdy', version: '1' }],
    ['spdy/2', { name: 'spdy', version: '2' }],
    ['spdy/3', { name: 'spdy', version: '3' }],
    ['stun.turn', { name: 'stun.turn', version: 'unknown' }],
    ['stun.nat-discovery', { name: 'stun.nat-discovery', version: 'unknown' }],
    ['h2', { name: 'http', version: '2' }],
    ['h2c', { name: 'http', version: '2c' }],
    ['webrtc', { name: 'webrtc', version: 'unknown' }],
    ['c-webrtc', { name: 'c-webrtc', version: 'unknown' }],
    ['ftp', { name: 'ftp', version: 'unknown' }],
    ['imap', { name: 'imap', version: 'unknown' }],
    ['pop3', { name: 'pop', version: '3' }],
    ['managesieve', { name: 'managesieve', version: 'unknown' }],
    ['coap', { name: 'coap', version: 'unknown' }],
    ['xmpp-client', { name: 'xmpp-client', version: 'unknown' }],
    ['xmpp-server', { name: 'xmpp-server', version: 'unknown' }],
    ['acme-tls/1', { name: 'acme-tls', version: '1' }],
    ['mqtt', { name: 'mqtt', version: 'unknown' }],
    ['dot', { name: 'dot', version: 'unknown' }],
    ['ntske/1', { name: 'ntske', version: '1' }],
    ['sunrpc', { name: 'sunrpc', version: 'unknown' }],
    ['h3', { name: 'http', version: '3' }],
    ['smb', { name: 'smb', version: 'unknown' }],
    ['irc', { name: 'irc', version: 'unknown' }],
    ['nntp', { name: 'nntp', version: 'unknown' }],
    ['nnsp', { name: 'nnsp', version: 'unknown' }],
    ['doq', { name: 'doq', version: 'unknown' }],
    ['sip/2', { name: 'sip', version: '2' }],
    ['tds/8.0', { name: 'tds', version: '8.0' }],
    ['dicom', { name: 'dicom', version: 'unknown' }],
    ['', { name: '', version: 'unknown' }],
  ])('Extracting version from ALPN protocol %s', (protocol, expected) => {
    expect(extractNetworkProtocol(protocol)).toMatchObject(expected);
  });
});
