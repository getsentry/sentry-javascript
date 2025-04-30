import { logger } from '@sentry/core';
import type { Logger } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { NetworkMetaWarning } from './types';

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
export function getBodyString(body: unknown, _logger: Logger = logger): [string | undefined, NetworkMetaWarning?] {
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
    DEBUG_BUILD && _logger.error(error, 'Failed to serialize body', body);
    return [undefined, 'BODY_PARSE_ERROR'];
  }

  DEBUG_BUILD && _logger.info('Skipping network body because of body type', body);

  return [undefined, 'UNPARSEABLE_BODY_TYPE'];
}

/**
 * Parses the fetch arguments to extract the request payload.
 *
 * We only support getting the body from the fetch options.
 */
export function getFetchRequestArgBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] as RequestInit).body;
}
