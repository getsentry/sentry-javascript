import type { Span, SpanAttributes } from '../../types-hoist/span';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_URL_FULL,
} from '../../semanticAttributes';
import { getHttpSpanDetailsFromUrlObject, parseStringToURLObject } from '../../utils/url';
import type { HttpClientRequest, HttpIncomingMessage } from './types';
import { getRequestUrl } from './get-request-url';
import type { StartSpanOptions } from '../../types-hoist/startSpanOptions';

/**
 * Build the initial span name and attributes for an outgoing HTTP request.
 * This is called before the span is created, to get the initial details.
 */
export function getOutgoingRequestSpanData(request: HttpClientRequest): StartSpanOptions {
  const url = getRequestUrl(request);
  const [name, attributes] = getHttpSpanDetailsFromUrlObject(
    parseStringToURLObject(url),
    'client',
    'auto.http.client',
    request,
  );

  const userAgent = request.getHeader('user-agent');

  return {
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.http',
      'otel.kind': 'CLIENT',
      [SEMANTIC_ATTRIBUTE_URL_FULL]: url,
      'http.url': url,
      'http.method': request.method,
      'http.target': request.path || '/',
      'net.peer.name': request.host,
      'http.host': request.getHeader('host') as string | undefined,
      ...(userAgent ? { 'user_agent.original': userAgent as string } : {}),
      ...attributes,
    },
    onlyIfParent: true,
  };
}

/**
 * Add span attributes once the response is received.
 */
export function setIncomingResponseSpanData(response: HttpIncomingMessage, span: Span): void {
  const { statusCode, statusMessage, httpVersion, socket } = response;
  const transport = httpVersion?.toUpperCase() !== 'QUIC' ? 'ip_tcp' : 'ip_udp';

  span.setAttributes({
    'http.response.status_code': statusCode,
    'network.protocol.version': httpVersion,
    'http.flavor': httpVersion,
    'network.transport': transport,
    'net.transport': transport,
    'http.status_text': statusMessage?.toUpperCase(),
    'http.status_code': statusCode,
    ...getResponseContentLengthAttributes(response),
    ...getSocketAttrs(socket),
  });
}

function getSocketAttrs(socket: HttpIncomingMessage['socket']): SpanAttributes {
  if (!socket) return {};
  const { remoteAddress, remotePort } = socket;
  return {
    'network.peer.address': remoteAddress,
    'network.peer.port': remotePort,
    'net.peer.ip': remoteAddress,
    'net.peer.port': remotePort,
  };
}

function getResponseContentLengthAttributes(response: HttpIncomingMessage): SpanAttributes {
  const { headers } = response;
  const contentLengthHeader = headers['content-length'];
  const length = contentLengthHeader ? parseInt(String(contentLengthHeader), 10) : -1;
  const encoding = headers['content-encoding'];
  return length >= 0
    ? encoding && encoding !== 'identity'
      ? { 'http.response_content_length': length }
      : { 'http.response_content_length_uncompressed': length }
    : {};
}
