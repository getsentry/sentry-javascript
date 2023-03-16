import { getCurrentHub } from '@sentry/core';
import type {
  Breadcrumb,
  BreadcrumbHint,
  HandlerDataFetch,
  SentryWrappedXMLHttpRequest,
  TextEncoderInternal,
} from '@sentry/types';
import { logger } from '@sentry/utils';

type RequestBody = null | Blob | BufferSource | FormData | URLSearchParams | string;

interface ExtendedNetworkBreadcrumbsOptions {
  textEncoder: TextEncoderInternal;
}

/**
 * This will enrich the xhr/fetch breadcrumbs with additional information.
 *
 * This adds:
 * * request_body_size
 * * response_body_size
 *
 * to the breadcrumb data.
 */
export function extendNetworkBreadcrumbs(): void {
  const client = getCurrentHub().getClient();

  try {
    const textEncoder = new TextEncoder();

    const options: ExtendedNetworkBreadcrumbsOptions = {
      textEncoder,
    };

    if (client && client.on) {
      client.on('beforeAddBreadcrumb', (breadcrumb, hint) => _beforeNetworkBreadcrumb(options, breadcrumb, hint));
    }
  } catch {
    // Do nothing
  }
}

function _beforeNetworkBreadcrumb(
  options: ExtendedNetworkBreadcrumbsOptions,
  breadcrumb: Breadcrumb,
  hint?: BreadcrumbHint,
): void {
  if (!breadcrumb.data) {
    return;
  }

  try {
    if (breadcrumb.category === 'xhr' && hint && hint.xhr) {
      _enrichXhrBreadcrumb(
        breadcrumb as Breadcrumb & { data: object },
        {
          xhr: hint.xhr as XMLHttpRequest & SentryWrappedXMLHttpRequest,
          body: hint.input as RequestBody,
        },
        options,
      );
    }

    if (breadcrumb.category === 'fetch' && hint) {
      _enrichFetchBreadcrumb(
        breadcrumb as Breadcrumb & { data: object },
        {
          input: hint.input as HandlerDataFetch['args'],
          response: hint.response as Response,
        },
        options,
      );
    }
  } catch (e) {
    __DEBUG_BUILD__ && logger.warn('Error when enriching network breadcrumb');
  }
}

function _enrichXhrBreadcrumb(
  breadcrumb: Breadcrumb & { data: object },
  hint: { xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest; body?: RequestBody },
  options: ExtendedNetworkBreadcrumbsOptions,
): void {
  const { xhr, body } = hint;

  const reqSize = getBodySize(body, options.textEncoder);
  const resSize = xhr.getResponseHeader('content-length')
    ? parseContentSizeHeader(xhr.getResponseHeader('content-length'))
    : getBodySize(xhr.response, options.textEncoder);

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

function _enrichFetchBreadcrumb(
  breadcrumb: Breadcrumb & { data: object },
  hint: {
    input: HandlerDataFetch['args'];
    response: Response;
  },
  options: ExtendedNetworkBreadcrumbsOptions,
): void {
  const { input, response } = hint;

  const body = getFetchBody(input);
  const reqSize = getBodySize(body, options.textEncoder);
  const resSize = response ? parseContentSizeHeader(response.headers.get('content-length')) : undefined;

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

/** only exported for tests */
export function getBodySize(
  body: RequestInit['body'],
  textEncoder: TextEncoder | TextEncoderInternal,
): number | undefined {
  if (!body) {
    return undefined;
  }

  try {
    if (typeof body === 'string') {
      return textEncoder.encode(body).length;
    }

    if (body instanceof URLSearchParams) {
      return textEncoder.encode(body.toString()).length;
    }

    if (body instanceof FormData) {
      // This is a bit simplified, but gives us a decent estimate
      // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
      // @ts-ignore passing FormData to URLSearchParams actually works
      const formDataStr = new URLSearchParams(body).toString();
      return textEncoder.encode(formDataStr).length;
    }

    if (body instanceof Blob) {
      return body.size;
    }

    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }

    // Currently unhandled types: ArrayBufferView, ReadableStream
  } catch {
    // just return undefined
  }

  return undefined;
}

/** only exported for tests */
export function parseContentSizeHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const size = parseInt(header, 10);
  return isNaN(size) ? undefined : size;
}

function getFetchBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  // We only support getting the body from the fetch options
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] as RequestInit).body;
}
