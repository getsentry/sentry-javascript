import { createServer } from 'node:http';

export const OTLP_RECEIVER_PORT = 3033;

export interface CollectedSpan {
  traceId: string;
  spanId: string;
  name: string;
}

export interface CollectedMetric {
  name: string;
  value: number;
  attributes: Record<string, string>;
}

const collectedSpans: CollectedSpan[] = [];
const collectedMetrics: CollectedMetric[] = [];

interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
}

function flattenAttributes(attributes: { key: string; value: OtlpAnyValue }[] = []): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const { key, value } of attributes) {
    const rawValue = value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue;
    if (rawValue !== undefined) {
      flattened[key] = String(rawValue);
    }
  }

  return flattened;
}

function collectSpans(body: any): void {
  for (const resourceSpan of body?.resourceSpans ?? []) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        collectedSpans.push({ traceId: span.traceId, spanId: span.spanId, name: span.name });
      }
    }
  }
}

function collectMetrics(body: any): void {
  for (const resourceMetric of body?.resourceMetrics ?? []) {
    for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
      for (const metric of scopeMetric.metrics ?? []) {
        // Only counters are recorded by this app, so `sum` is the only shape that needs handling.
        for (const dataPoint of metric.sum?.dataPoints ?? []) {
          collectedMetrics.push({
            name: metric.name,
            value: Number(dataPoint.asInt ?? dataPoint.asDouble ?? 0),
            attributes: flattenAttributes(dataPoint.attributes),
          });
        }
      }
    }
  }
}

async function readJsonBody(stream: AsyncIterable<Buffer>): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Stands in for the OTLP backend the app would export to in production, so the test can assert what
 * the user's OpenTelemetry SDK actually put on the wire.
 *
 * It deliberately runs as a plain `node:http` server rather than a Next.js route: exporting into the
 * Next.js server would make every export request produce spans of its own, which would then be
 * exported again.
 */
export function startOtlpReceiver(): void {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'POST' && req.url === '/v1/traces') {
        collectSpans(await readJsonBody(req));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/metrics') {
        collectMetrics(await readJsonBody(req));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }

      if (req.method === 'GET' && req.url === '/collected') {
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ spans: collectedSpans, metrics: collectedMetrics }));
        return;
      }

      res.writeHead(404).end();
    })();
  });

  server.listen(OTLP_RECEIVER_PORT);
}
