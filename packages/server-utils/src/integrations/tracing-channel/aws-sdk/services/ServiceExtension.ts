import type { Span } from '@sentry/core';
import type { NormalizedRequest, NormalizedResponse, RequestMetadata } from '../types';

export type { RequestMetadata };

export interface ServiceExtension {
  // called before the request is sent, and before the span is started
  requestPreSpanHook: (request: NormalizedRequest) => RequestMetadata;

  // called before the request is sent, and after the span is started. `span` is the started span,
  // used to derive trace-propagation headers injected into outgoing messages.
  requestPostSpanHook?: (request: NormalizedRequest, span: Span) => void;

  // called after the response is received. If a value is returned, it replaces the response output.
  responseHook?: (response: NormalizedResponse, span: Span) => any | undefined;
}
