import type { CollectedMetric, CollectedSpan } from '../otel-receiver';
import { OTLP_RECEIVER_PORT } from '../otel-receiver';

const OTLP_RECEIVER_URL = `http://localhost:${OTLP_RECEIVER_PORT}`;

interface Collected {
  spans: CollectedSpan[];
  metrics: CollectedMetric[];
}

async function waitForCollected<T>(select: (collected: Collected) => T | undefined, description: string): Promise<T> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${OTLP_RECEIVER_URL}/collected`);
    const collected = (await response.json()) as Collected;

    const match = select(collected);
    if (match !== undefined) {
      return match;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${description} to be exported over OTLP`);
}

export const waitForExportedSpan = (
  matches: (span: CollectedSpan) => boolean,
  description: string,
): Promise<CollectedSpan> => waitForCollected(({ spans }) => spans.find(matches), description);

export const waitForExportedMetric = (
  matches: (metric: CollectedMetric) => boolean,
  description: string,
): Promise<CollectedMetric> => waitForCollected(({ metrics }) => metrics.find(matches), description);

export async function triggerTelemetry(baseURL: string, id: string): Promise<{ traceId: string; spanId: string }> {
  const response = await fetch(`${baseURL}/api/telemetry/${id}`);
  return (await response.json()) as { traceId: string; spanId: string };
}
