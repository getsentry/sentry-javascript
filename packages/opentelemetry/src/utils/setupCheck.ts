type OpenTelemetryElement = 'SentrySpanProcessor' | 'SentryContextManager' | 'SentryPropagator' | 'SentrySampler';

const setupElements = new Set<OpenTelemetryElement>();

/** Get all the OpenTelemetry elements that have been set up. */
export function openTelemetrySetupCheck(): OpenTelemetryElement[] {
  return Array.from(setupElements);
}

/** Mark an OpenTelemetry element as setup. */
export function setIsSetup(element: OpenTelemetryElement): void {
  setupElements.add(element);
}

/** Only exported for tests. */
export function clearOpenTelemetrySetupCheck(): void {
  setupElements.clear();
}
