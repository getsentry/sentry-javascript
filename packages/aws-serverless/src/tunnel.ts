import { debug } from '@sentry/core';
import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_isServedTunnelRequest as isServedTunnelRequest,
} from '@sentry/core/server';
import { DEBUG_BUILD } from './debug-build';

/**
 * The parts of an API Gateway (REST and HTTP API), function URL or ALB event the tunnel reads.
 */
interface HttpEvent {
  version?: string;
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: { http?: { method?: string }; elb?: unknown };
  headers?: Record<string, string | undefined> | null;
  multiValueHeaders?: Record<string, string[] | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

/**
 * The result shape API Gateway, function URLs and ALB accept from a handler.
 */
interface HttpResult {
  statusCode: number;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
  isBase64Encoded: boolean;
}

/**
 * The streaming response helper the Lambda runtime provides.
 */
declare const awslambda:
  | {
      HttpResponseStream: {
        from(
          stream: unknown,
          metadata: { statusCode: number; headers: Record<string, string> },
        ): {
          end(chunk?: Uint8Array): void;
        };
      };
    }
  | undefined;

/**
 * Answers a managed tunnel request that came in as an HTTP event, before the handler runs. Lambda runs no HTTP server,
 * so the handler invocation is the only place to do it. Returns `undefined` for every other event.
 *
 * It never throws. Until a request is claimed, a failure hands the event to the handler. Once claimed, it ends in a
 * 502 instead.
 */
export function answerTunnelEvent(event: unknown): Promise<HttpResult> | undefined {
  const request = toTunnelRequest(event);
  if (!request) {
    return undefined;
  }

  const handled = handleServedTunnelRequest(request);
  if (!handled) {
    return undefined;
  }

  const httpEvent = event as HttpEvent;

  return handled
    .then(response => toHttpResult(response, !!httpEvent.multiValueHeaders))
    .catch(() => ({ statusCode: 502, body: '', isBase64Encoded: false }));
}

/**
 * Answers a managed tunnel request for a streaming handler, writing the answer to its response stream. Returns
 * `undefined` for every other event, or when the runtime has no `awslambda.HttpResponseStream`.
 */
export function answerStreamingTunnelEvent(event: unknown, responseStream: unknown): Promise<void> | undefined {
  if (typeof awslambda === 'undefined' || !awslambda?.HttpResponseStream) {
    return undefined;
  }

  const request = toTunnelRequest(event);
  const handled = request && handleServedTunnelRequest(request);
  if (!handled) {
    return undefined;
  }

  return handled
    .then(async response => {
      const body = new Uint8Array(await response.arrayBuffer());
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers),
      });
      stream.end(body);
    })
    .catch(error => {
      DEBUG_BUILD && debug.error('Sentry tunnel: failed to answer a streaming tunnel request', error);
    });
}

/**
 * Builds a `Request` from an HTTP event that targets the tunnel, or returns `undefined`. Matches on the method and
 * path first, so no other event's body gets decoded.
 */
function toTunnelRequest(event: unknown): Request | undefined {
  try {
    if (!event || typeof event !== 'object') {
      return undefined;
    }

    const httpEvent = event as HttpEvent;
    const method = httpEvent.requestContext?.http?.method ?? httpEvent.httpMethod;
    const path =
      typeof httpEvent.rawPath === 'string'
        ? `${httpEvent.rawPath}${httpEvent.rawQueryString ? `?${httpEvent.rawQueryString}` : ''}`
        : httpEvent.path;
    if (!method || !path || !isServedTunnelRequest({ method, url: path })) {
      return undefined;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(httpEvent.headers ?? {})) {
      if (value !== undefined) {
        headers.set(name, value);
      }
    }
    for (const [name, values] of Object.entries(httpEvent.multiValueHeaders ?? {})) {
      if (values?.length && !headers.has(name)) {
        headers.set(name, values.join(', '));
      }
    }

    // API Gateway base64-encodes binary bodies, like a compressed replay envelope.
    const body = httpEvent.body
      ? httpEvent.isBase64Encoded
        ? Uint8Array.from(atob(httpEvent.body), char => char.charCodeAt(0))
        : new TextEncoder().encode(httpEvent.body)
      : new Uint8Array(0);
    // The tunnel needs the length, which an event doesn't always carry.
    headers.set('content-length', String(body.length));

    return new Request(`https://${headers.get('host') || 'localhost'}${path}`, { method, headers, body });
  } catch (error) {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to read a Lambda event', error);

    return undefined;
  }
}

async function toHttpResult(response: Response, multiValueHeaders: boolean): Promise<HttpResult> {
  const headers = Object.fromEntries(response.headers);

  return {
    statusCode: response.status,
    ...(multiValueHeaders
      ? { multiValueHeaders: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value]])) }
      : { headers }),
    body: await response.text(),
    isBase64Encoded: false,
  };
}
