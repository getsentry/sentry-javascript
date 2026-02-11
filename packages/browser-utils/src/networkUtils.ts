import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { NetworkMetaWarning } from './types';

// Symbol used by e.g. the Replay integration to store original body on Request objects
export const ORIGINAL_REQ_BODY = Symbol.for('sentry__originalRequestBody');

/**
 * Serializes FormData.
 *
 * This is a bit simplified, but gives us a decent estimate.
 * This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'.
 *
 */
export function serializeFormData(formData: FormData): string {
  // @ts-expect-error passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}

/** Get the string representation of a body. */
export function getBodyString(body: unknown, _debug: typeof debug = debug): [string | undefined, NetworkMetaWarning?] {
  try {
    if (typeof body === 'string') {
      return [body];
    }

    if (body instanceof URLSearchParams) {
      return [body.toString()];
    }

    if (body instanceof FormData) {
      return [serializeFormData(body)];
    }

    if (!body) {
      return [undefined];
    }
  } catch (error) {
    DEBUG_BUILD && _debug.error(error, 'Failed to serialize body', body);
    return [undefined, 'BODY_PARSE_ERROR'];
  }

  DEBUG_BUILD && _debug.log('Skipping network body because of body type', body);

  return [undefined, 'UNPARSEABLE_BODY_TYPE'];
}

/**
 * Parses the fetch arguments to extract the request payload.
 *
 * In case of a Request object, this function attempts to retrieve the original body by looking for a Sentry-patched symbol.
 */
export function getFetchRequestArgBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  // Second argument with body options takes precedence
  if (fetchArgs.length >= 2 && fetchArgs[1] && typeof fetchArgs[1] === 'object' && 'body' in fetchArgs[1]) {
    return (fetchArgs[1] as RequestInit).body;
  }

  if (fetchArgs.length >= 1 && fetchArgs[0] instanceof Request) {
    const request = fetchArgs[0];
    /* The Request interface's body is a ReadableStream, which we cannot directly access.
       Some integrations (e.g. Replay) patch the Request object to store the original body. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const originalBody = (request as any)[ORIGINAL_REQ_BODY];
    if (originalBody !== undefined) {
      return originalBody;
    }

    return undefined; // Fall back to returning undefined (as we don't want to return a ReadableStream)
  }

  return undefined;
}

/**
 * Parses XMLHttpRequest response headers into a Record.
 * Extracted from replay internals to be reusable.
 */
export function parseXhrResponseHeaders(xhr: XMLHttpRequest): Record<string, string> {
  let headers: string | undefined;
  try {
    headers = xhr.getAllResponseHeaders();
  } catch (error) {
    DEBUG_BUILD && debug.error(error, 'Failed to get xhr response headers', xhr);
    return {};
  }

  if (!headers) {
    return {};
  }

  return headers.split('\r\n').reduce((acc: Record<string, string>, line: string) => {
    const [key, value] = line.split(': ') as [string, string | undefined];
    if (value) {
      acc[key.toLowerCase()] = value;
    }
    return acc;
  }, {});
}
