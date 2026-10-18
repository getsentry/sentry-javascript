import type { SeverityLevel } from '@sentry/core';
import { captureEvent } from '@sentry/core';
import type { DiagnosticEvent } from 'solid-js';

const LEVEL: Record<DiagnosticEvent['severity'], SeverityLevel> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
};

export interface DiagnosticsOptions {
  /**
   * Minimum severity to report as an issue. `info` findings are advisory in
   * Solid's own tiering (structured channel only, never the console); the
   * default reports `warn` and up.
   */
  minSeverity?: DiagnosticEvent['severity'];
}

/**
 * A finding's `data`, as the issue's extras. `data.error` — the value as
 * thrown, unsanitized, on the server error findings — is left out: the error
 * hook already captured it as an exception, and an extras object is not
 * where an error's own properties should travel.
 */
function extras(event: DiagnosticEvent): Record<string, unknown> {
  const { error: _error, ...data } = event.data ?? {};
  return { ...data, ownerPath: event.ownerPath, message: event.message };
}

const RANK: Record<DiagnosticEvent['severity'], number> = { info: 0, warn: 1, error: 2 };

/**
 * A finding is an issue, not a span: it has a stable identity and recurs.
 * Fingerprinted by code + owner path so every occurrence of "the pager holds
 * silently" groups into one issue across sessions and minified identifiers.
 */
export function captureDiagnostic(event: DiagnosticEvent, options: DiagnosticsOptions = {}): void {
  if (RANK[event.severity] < RANK[options.minSeverity ?? 'warn']) return;
  captureEvent({
    message: event.message.split('\n')[0],
    level: LEVEL[event.severity],
    fingerprint: [event.code, ...(event.ownerPath ?? (event.nodeName ? [event.nodeName] : []))],
    tags: {
      'solid.code': event.code,
      'solid.kind': event.kind,
      'solid.node': event.nodeName,
      'solid.owner': event.ownerPath?.join(' › '),
    },
    extra: extras(event),
  });
}
