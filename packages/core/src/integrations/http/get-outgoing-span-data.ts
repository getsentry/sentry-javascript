import type { Span, SpanAttributes } from '../../types/span';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '../../semanticAttributes';
import { filterCollectedUrl } from '../../utils/data-collection/filterCollectedUrl';
import { getHttpSpanDetailsFromUrlObject, parseStringToURLObject } from '../../utils/url';
import type { HttpClientRequest, HttpIncomingMessage } from './types';
import { getRequestUrlFromClientRequest } from './get-request-url';
import type { StartSpanOptions } from '../../types/startSpanOptions';
import {
  HTTP_RESPONSE_BODY_SIZE,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_TARGET,
  NETWORK_LOCAL_ADDRESS,
  NETWORK_LOCAL_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  NETWORK_TRANSPORT,
  SERVER_ADDRESS,
  SERVER_PORT,
  SENTRY_KIND,
  URL_FULL,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';

/**
 * Build the initial span name and attributes for an outgoing HTTP request.
 * This is called before the span is created, to get the initial details.
 */
export function getOutgoingRequestSpanData(request: HttpClientRequest): StartSpanOptions {
  const url = getRequestUrlFromClientRequest(request);
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
      [SENTRY_KIND]: 'client',
      [URL_FULL]: filterCollectedUrl(url),
      // eslint-disable-next-line typescript/no-deprecated
      [HTTP_TARGET]: filterCollectedUrl(request.path || '/'),
      [SERVER_ADDRESS]: request.host,
      [SERVER_PORT]: typeof request.port === 'number' && !isNaN(request.port) ? request.port : undefined,
      [USER_AGENT_ORIGINAL]: userAgent || undefined,
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
  const transport = httpVersion?.toUpperCase() !== 'QUIC' ? 'tcp' : 'udp';

  span.setAttributes({
    [HTTP_RESPONSE_STATUS_CODE]: statusCode,
    [NETWORK_PROTOCOL_NAME]: 'http',
    [NETWORK_PROTOCOL_VERSION]: httpVersion,
    [NETWORK_TRANSPORT]: transport,
    'http.response.status_text': statusMessage?.toUpperCase(),
    ...getResponseContentLengthAttributes(response),
    ...getSocketAttrs(socket),
  });
}

function getSocketAttrs(socket: HttpIncomingMessage['socket']): SpanAttributes {
  if (!socket) return {};
  const { localAddress, localPort, remoteAddress, remotePort } = socket;
  return {
    [NETWORK_LOCAL_ADDRESS]: localAddress,
    [NETWORK_LOCAL_PORT]: localPort,
    [NETWORK_PEER_ADDRESS]: remoteAddress,
    [NETWORK_PEER_PORT]: remotePort,
  };
}

function getResponseContentLengthAttributes(response: HttpIncomingMessage): SpanAttributes {
  const { headers } = response;
  const contentLengthHeader = headers['content-length'];
  const length = contentLengthHeader ? parseInt(String(contentLengthHeader), 10) : -1;
  const encoding = headers['content-encoding'];
  return length >= 0
    ? encoding && encoding !== 'identity'
      ? { [HTTP_RESPONSE_BODY_SIZE]: length }
      : { 'http.response.body.decoded_size': length }
    : {};
}
