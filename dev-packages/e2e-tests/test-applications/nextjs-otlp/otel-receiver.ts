import { createServer } from 'node:http';

export const OTLP_RECEIVER_PORT = 3033;

export interface CollectedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  sentryAuthHeader?: string;
}

const collectedSpans: CollectedSpan[] = [];

function collectSpans(body: any, sentryAuthHeader: string | undefined): void {
  for (const resourceSpan of body?.resourceSpans ?? []) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        collectedSpans.push({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          sentryAuthHeader,
        });
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
 * the app's OpenTelemetry SDK actually put on the wire.
 *
 * It deliberately runs as a plain `node:http` server rather than a Next.js route: exporting into the
 * Next.js server would make every export request produce spans of its own, which would then be
 * exported again.
 */
export function startOtlpReceiver(): void {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'POST' && req.url === '/v1/traces') {
        const sentryAuthHeader = req.headers['x-sentry-auth'];
        collectSpans(await readJsonBody(req), Array.isArray(sentryAuthHeader) ? sentryAuthHeader[0] : sentryAuthHeader);
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }

      if (req.method === 'GET' && req.url === '/collected') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ spans: collectedSpans }));
        return;
      }

      res.writeHead(404).end();
    })();
  });

  server.listen(OTLP_RECEIVER_PORT);
}
