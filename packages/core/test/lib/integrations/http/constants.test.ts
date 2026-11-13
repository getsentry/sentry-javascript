import { describe, expect, it } from 'vitest';
import {
  HTTP2_ON_SERVER_STREAM,
  HTTP_ON_CLIENT_REQUEST,
  HTTP_ON_SERVER_REQUEST,
  LOG_PREFIX,
} from '../../../../src/integrations/http/constants';

describe('http constants', () => {
  it('LOG_PREFIX is the expected string', () => {
    expect(LOG_PREFIX).toBe('@sentry/instrumentation-http');
  });

  it('HTTP_ON_CLIENT_REQUEST is the diagnostics-channel name', () => {
    expect(HTTP_ON_CLIENT_REQUEST).toBe('http.client.request.created');
  });

  it('HTTP_ON_SERVER_REQUEST is the diagnostics-channel name', () => {
    expect(HTTP_ON_SERVER_REQUEST).toBe('http.server.request.start');
  });

  it('HTTP2_ON_SERVER_STREAM is the diagnostics-channel name', () => {
    expect(HTTP2_ON_SERVER_STREAM).toBe('http2.server.stream.start');
  });
});
