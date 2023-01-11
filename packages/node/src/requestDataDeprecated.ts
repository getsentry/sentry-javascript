/**
 * Deprecated functions which are slated for removal in v8. When the time comes, this entire file can be deleted.
 *
 * See https://github.com/getsentry/sentry-javascript/pull/5257.
 */

/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Event, ExtractedNodeRequestData, PolymorphicRequest } from '@sentry/types';

import type { AddRequestDataToEventOptions } from './requestdata';
import { addRequestDataToEvent, extractRequestData as _extractRequestData } from './requestdata';

/**
 * @deprecated `Handlers.ExpressRequest` is deprecated and will be removed in v8. Use `PolymorphicRequest` instead.
 */
export type ExpressRequest = PolymorphicRequest;

/**
 * Normalizes data from the request object, accounting for framework differences.
 *
 * @deprecated `Handlers.extractRequestData` is deprecated and will be removed in v8. Use `extractRequestData` instead.
 *
 * @param req The request object from which to extract data
 * @param keys An optional array of keys to include in the normalized data.
 * @returns An object containing normalized request data
 */
export function extractRequestData(req: { [key: string]: any }, keys?: string[]): ExtractedNodeRequestData {
  return _extractRequestData(req, { include: keys });
}

/**
 * Options deciding what parts of the request to use when enhancing an event
 *
 * @deprecated `Handlers.ParseRequestOptions` is deprecated and will be removed in v8. Use
 * `AddRequestDataToEventOptions` in `@sentry/utils` instead.
 */
export type ParseRequestOptions = AddRequestDataToEventOptions['include'] & {
  serverName?: boolean;
  version?: boolean;
};

/**
 * Enriches passed event with request data.
 *
 * @deprecated `Handlers.parseRequest` is deprecated and will be removed in v8. Use `addRequestDataToEvent` instead.
 *
 * @param event Will be mutated and enriched with req data
 * @param req Request object
 * @param options object containing flags to enable functionality
 * @hidden
 */
export function parseRequest(event: Event, req: ExpressRequest, options: ParseRequestOptions = {}): Event {
  return addRequestDataToEvent(event, req, { include: options });
}
