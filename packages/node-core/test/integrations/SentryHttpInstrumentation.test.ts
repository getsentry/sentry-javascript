import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { _getOutgoingRequestEndedSpanData } from '../../src/integrations/http/SentryHttpInstrumentation';

function createResponse(overrides: Partial<http.IncomingMessage>): http.IncomingMessage {
  return {
    statusCode: 200,
    statusMessage: 'OK',
    httpVersion: '1.1',
    headers: {},
    socket: undefined,
    ...overrides,
  } as unknown as http.IncomingMessage;
}

describe('_getOutgoingRequestEndedSpanData', () => {
  it('sets ip_tcp transport for HTTP/1.1', () => {
    const attributes = _getOutgoingRequestEndedSpanData(createResponse({ httpVersion: '1.1' }));

    expect(attributes['network.transport']).toBe('ip_tcp');
    expect(attributes['net.transport']).toBe('ip_tcp');
    expect(attributes['network.protocol.version']).toBe('1.1');
    expect(attributes['http.flavor']).toBe('1.1');
  });

  it('sets ip_udp transport for QUIC', () => {
    const attributes = _getOutgoingRequestEndedSpanData(createResponse({ httpVersion: 'QUIC' }));

    expect(attributes['network.transport']).toBe('ip_udp');
    expect(attributes['net.transport']).toBe('ip_udp');
  });

  it('does not throw when httpVersion is null', () => {
    expect(() =>
      _getOutgoingRequestEndedSpanData(createResponse({ httpVersion: null as unknown as string })),
    ).not.toThrow();

    const attributes = _getOutgoingRequestEndedSpanData(createResponse({ httpVersion: null as unknown as string }));
    expect(attributes['network.transport']).toBe('ip_tcp');
    expect(attributes['net.transport']).toBe('ip_tcp');
  });

  it('does not throw when httpVersion is undefined', () => {
    expect(() =>
      _getOutgoingRequestEndedSpanData(createResponse({ httpVersion: undefined as unknown as string })),
    ).not.toThrow();
  });
});
