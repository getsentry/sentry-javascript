import type { Carrier, Scope } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { Hub } from '@sentry/core';
import type { Client } from '@sentry/types';

import { OpenTelemetryScope } from './scope';

/**
 * A custom hub that ensures we always creat an OTEL scope.
 * Exported only for testing
 */
export class OpenTelemetryHub extends Hub {
  public constructor(client?: Client, scope: Scope = new OpenTelemetryScope(), isolationScope?: Scope) {
    super(client, scope, isolationScope);
  }

}

/**
 * Ensure the global hub is an OpenTelemetryHub.
 */
export function setupGlobalHub(): void {
  const carrier = getMainCarrier();
  const sentry = getSentryCarrier(carrier);

  // We register a custom hub creator
  sentry.createHub = (...options: ConstructorParameters<typeof OpenTelemetryHub>) => {
    return new OpenTelemetryHub(...options);
  };

  const hub = sentry.hub;

  if (hub && hub instanceof OpenTelemetryHub) {
    return;
  }
  // If the current global hub is not correct, ensure we overwrite it
  sentry.hub = new OpenTelemetryHub();
}

/** Will either get the existing sentry carrier, or create a new one. */
function getSentryCarrier(carrier: Carrier): Carrier['__SENTRY__'] & object {
  if (!carrier.__SENTRY__) {
    carrier.__SENTRY__ = {
      extensions: {},
      hub: undefined,
    };
  }
  return carrier.__SENTRY__;
}
