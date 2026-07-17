import type { SpanKindValue } from '@sentry/core';

// Command inputs are service-specific shapes from hundreds of AWS APIs; typing them would require
// depending on the `@aws-sdk/*` client types. The per-service hooks read fields defensively instead.
export type CommandInput = Record<string, any>;

/**
 * These are normalized request and response. They organize the relevant data in one interface which
 * can be processed in a uniform manner in the per-service hooks.
 */
export interface NormalizedRequest {
  serviceName: string;
  commandName: string;
  commandInput: CommandInput;
  region?: string;
}

export interface NormalizedResponse {
  // The command output, shaped per service/command (see `CommandInput` on why this isn't typed).
  data: any;
  request: NormalizedRequest;
  requestId?: string;
}

/** Span metadata a per-service extension returns for the subscriber to build the span from. */
export interface RequestMetadata {
  // If true, then the response is a stream so the subscriber must not end the span when `send` settles.
  // The service extension ends the span itself, generally by wrapping the stream and ending after it is
  // consumed.
  isStream?: boolean;
  spanAttributes?: Record<string, unknown>;
  spanKind?: SpanKindValue;
  spanName?: string;
  // Overrides the default `rpc` span op (e.g. `db` for DynamoDB).
  spanOp?: string;
}
