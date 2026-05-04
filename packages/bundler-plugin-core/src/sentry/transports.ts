/**
 * This is a simplified version of the Sentry Node SDK's HTTP transport.
 */
import * as https from "node:https";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { createTransport, suppressTracing } from "@sentry/core";
import type {
  BaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
  TransportRequestExecutor,
} from "@sentry/types";
import { join } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * Gets a stream from a Uint8Array or string
 * Readable.from is ideal but was added in node.js v12.3.0 and v10.17.0
 */
function streamFromBody(body: Uint8Array | string): Readable {
  return new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
}

/**
 * Creates a RequestExecutor to be used with `createTransport`.
 */
function createRequestExecutor(options: BaseTransportOptions): TransportRequestExecutor {
  const { hostname, pathname, port, protocol, search } = new URL(options.url);
  return function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    return new Promise((resolve, reject) => {
      suppressTracing(() => {
        let body = streamFromBody(request.body);

        const headers: Record<string, string> = {};

        if (request.body.length > GZIP_THRESHOLD) {
          headers["content-encoding"] = "gzip";
          body = body.pipe(createGzip());
        }

        const req = https.request(
          {
            method: "POST",
            headers,
            hostname,
            path: `${pathname}${search}`,
            port,
            protocol,
          },
          (res) => {
            res.on("data", () => {
              // Drain socket
            });

            res.on("end", () => {
              // Drain socket
            });

            res.setEncoding("utf8");

            // "Key-value pairs of header names and values. Header names are lower-cased."
            // https://nodejs.org/api/http.html#http_message_headers
            const retryAfterHeader = res.headers["retry-after"] ?? null;
            const rateLimitsHeader = res.headers["x-sentry-rate-limits"] ?? null;

            resolve({
              statusCode: res.statusCode,
              headers: {
                "retry-after": retryAfterHeader,
                "x-sentry-rate-limits": Array.isArray(rateLimitsHeader)
                  ? rateLimitsHeader[0] || null
                  : rateLimitsHeader,
              },
            });
          }
        );

        req.on("error", reject);
        body.pipe(req);
      });
    });
  };
}

/**
 * Creates a Transport that uses native the native 'http' and 'https' modules to send events to Sentry.
 */
function makeNodeTransport(options: BaseTransportOptions): Transport {
  const requestExecutor = createRequestExecutor(options);
  return createTransport(options, requestExecutor);
}

/** A transport that can be optionally enabled as a later time than it's
 * creation */
export function makeOptionallyEnabledNodeTransport(
  shouldSendTelemetry: Promise<boolean>
): (options: BaseTransportOptions) => Transport {
  return (nodeTransportOptions) => {
    const nodeTransport = makeNodeTransport(nodeTransportOptions);

    return {
      flush: (timeout) => nodeTransport.flush(timeout),
      send: async (request) => {
        // If global.__SENTRY_INTERCEPT_TRANSPORT__ is an array, we push the
        // envelope into it for testing purposes.
        if (
          "__SENTRY_INTERCEPT_TRANSPORT__" in global &&
          Array.isArray(global.__SENTRY_INTERCEPT_TRANSPORT__)
        ) {
          global.__SENTRY_INTERCEPT_TRANSPORT__.push(request);
          return { statusCode: 200 };
        }

        if (await shouldSendTelemetry) {
          if (process.env["SENTRY_TEST_OUT_DIR"]) {
            const outDir = process.env["SENTRY_TEST_OUT_DIR"];
            mkdirSync(outDir, { recursive: true });
            const path = join(outDir, "sentry-telemetry.json");
            appendFileSync(path, JSON.stringify(request) + ",\n");
            return { statusCode: 200 };
          }

          return nodeTransport.send(request);
        }

        return { statusCode: 200 };
      },
    };
  };
}
