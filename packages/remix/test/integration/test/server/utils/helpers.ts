import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequestHandler } from '@remix-run/express';
import { debug } from '@sentry/core';
import type { EnvelopeItemType, Event, TransactionEvent } from '@sentry/core';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/node';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import express from 'express';
import type { Express } from 'express';
import type { HttpTerminator } from 'http-terminator';
import { createHttpTerminator } from 'http-terminator';

type DataCollectorOptions = {
  // Optional custom URL
  url?: string;

  // The expected amount of requests to the envelope endpoint.
  // If the amount of sent requests is lower than `count`, this function will not resolve.
  count?: number;

  // The method of the request.
  method?: 'get' | 'post';

  // Whether to stop the server after the requests have been intercepted
  endServer?: boolean;

  // Type(s) of the envelopes to capture
  envelopeType?: EnvelopeItemType | EnvelopeItemType[];
};

async function makeRequest(
  method: 'get' | 'post' = 'get',
  url: string,
  axiosConfig?: AxiosRequestConfig,
): Promise<void> {
  try {
    if (method === 'get') {
      await axios.get(url, axiosConfig);
    } else {
      await axios.post(url, axiosConfig);
    }
  } catch (e) {
    // We sometimes expect the request to fail, but not the test.
    // So, we do nothing.
    debug.warn(e);
  }
}

class TestEnv {
  private _axiosConfig: AxiosRequestConfig | undefined = undefined;
  private _terminator: HttpTerminator;

  public constructor(
    public readonly server: http.Server,
    public readonly url: string,
  ) {
    this.server = server;
    this.url = url;
    this._terminator = createHttpTerminator({ server: this.server, gracefulTerminationTimeout: 0 });
  }

  /**
   * Starts a test server and returns the TestEnv instance
   *
   * @param {string} testDir
   * @param {string} [serverPath]
   * @param {string} [scenarioPath]
   * @return {*}  {Promise<string>}
   */
  public static async init(testDir: string, serverPath?: string, scenarioPath?: string): Promise<TestEnv> {
    const defaultServerPath = path.resolve(process.cwd(), 'utils', 'defaults', 'server');

    const [server, url] = await new Promise<[http.Server, string]>(async resolve => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
      const { default: app } = (await import(serverPath || defaultServerPath)) as { default: Express };

      app.get('/test', async (_req, res) => {
        try {
          await import(scenarioPath || `${testDir}/scenario`);
        } finally {
          res.status(200).end();
        }
      });

      const server = app.listen(0, () => {
        const url = `http://localhost:${(server.address() as AddressInfo).port}/test`;
        resolve([server, url]);
      });
    });

    return new TestEnv(server, url);
  }

  /**
   * Intercepts and extracts up to a number of requests containing Sentry envelopes.
   *
   * @param {DataCollectorOptions} options
   * @returns The intercepted envelopes.
   */
  public async getMultipleEnvelopeRequest(options: DataCollectorOptions): Promise<Record<string, unknown>[][]> {
    const envelopeTypeArray =
      typeof options.envelopeType === 'string'
        ? [options.envelopeType]
        : options.envelopeType || (['event'] as EnvelopeItemType[]);

    // Use a ref to capture startIndex right before making the request
    // The claimed indices mechanism and stopping at count will ensure parallel requests don't interfere
    const startIndexRef = { startIndex: null as number | null };
    const resProm = this.setupNock(
      options.count || 1,
      typeof options.endServer === 'undefined' ? true : options.endServer,
      envelopeTypeArray,
      startIndexRef,
    );

    // Capture startIndex right before making the request
    const globalEnvelopesArray = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];
    startIndexRef.startIndex = globalEnvelopesArray.length;
    // Wait for the request to complete so Sentry has time to capture events
    await makeRequest(options.method, options.url || this.url, this._axiosConfig);
    // Flush Sentry events to ensure they're sent to the transport
    await Sentry.flush(2000);
    const result = await resProm;
    return result;
  }

  /**
   * Intercepts and extracts a single request containing a Sentry envelope
   *
   * @param {DataCollectorOptions} options
   * @returns The extracted envelope.
   */
  public async getEnvelopeRequest(options?: DataCollectorOptions): Promise<Array<Record<string, unknown>>> {
    const requests = await this.getMultipleEnvelopeRequest({ ...options, count: 1 });

    if (!requests[0]) {
      throw new Error('No requests found');
    }

    return requests[0];
  }

  /**
   * Sends a get request to given URL, with optional headers. Returns the response.
   * Ends the server instance and flushes the Sentry event queue.
   *
   * @param {Record<string, string>} [headers]
   * @return {*}  {Promise<any>}
   */
  public async getAPIResponse(
    url?: string,
    headers: Record<string, string> = {},
    endServer: boolean = true,
  ): Promise<unknown> {
    try {
      const { data } = await axios.get(url || this.url, {
        headers,
        // KeepAlive false to work around a Node 20 bug with ECONNRESET: https://github.com/axios/axios/issues/5929
        httpAgent: new http.Agent({ keepAlive: false }),
      });
      return data;
    } finally {
      await Sentry.flush();

      if (endServer) {
        this.server.close();
      }
    }
  }

  public async setupNock(
    count: number,
    endServer: boolean,
    envelopeType: EnvelopeItemType[],
    startIndexRef?: { startIndex: number | null },
  ): Promise<Record<string, unknown>[][]> {
    return new Promise((resolve, reject) => {
      const envelopes: Record<string, unknown>[][] = [];
      let timeoutId: NodeJS.Timeout | null = null;
      let checkInterval: NodeJS.Timeout | null = null;

      // Track the starting length to only count envelopes added after the request is made
      // If startIndexRef is provided, use it (set right before request); otherwise capture now
      let startIndex: number;
      if (startIndexRef) {
        // Wait for startIndex to be set (it will be set right before request is made)
        const getStartIndex = () => {
          if (startIndexRef.startIndex === null) {
            const globalEnvelopesArray = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];
            return globalEnvelopesArray.length;
          }
          return startIndexRef.startIndex;
        };
        startIndex = getStartIndex();
      } else {
        const globalEnvelopesArray = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];
        startIndex = globalEnvelopesArray.length;
      }

      // Use a global Set to track which envelope indices have been claimed
      // This prevents parallel setupNock instances from matching the same envelopes
      if (!(globalThis as any).__SENTRY_TEST_CLAIMED_ENVELOPE_INDICES__) {
        (globalThis as any).__SENTRY_TEST_CLAIMED_ENVELOPE_INDICES__ = new Set<number>();
      }
      const claimedIndices = (globalThis as any).__SENTRY_TEST_CLAIMED_ENVELOPE_INDICES__ as Set<number>;

      // Poll for envelopes from the custom transport
      const checkForEnvelopes = () => {
        // If using ref, wait until it's set (set right before request is made)
        if (startIndexRef && startIndexRef.startIndex === null) {
          return; // Don't check yet, startIndex hasn't been set
        }

        const globalEnvelopes = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];

        // Use the ref value if provided, otherwise use the initial startIndex
        const currentStartIndex = startIndexRef?.startIndex ?? startIndex;

        // Only check envelopes that were added after the request started
        // Check each envelope by its index in the global array
        // Stop once we have enough envelopes to avoid claiming more than needed
        for (let i = currentStartIndex; i < globalEnvelopes.length && envelopes.length < count; i++) {
          // Skip if this envelope index has already been claimed by another setupNock
          if (claimedIndices.has(i)) {
            continue;
          }

          const envelope = globalEnvelopes[i];
          // The parsed envelope format is [header, itemHeader, itemPayload]
          // where itemHeader has a 'type' property
          const itemHeader = envelope[1];
          if (itemHeader && envelopeType.includes(itemHeader.type as EnvelopeItemType)) {
            // Check if we've already added this envelope to our local array
            if (!envelopes.includes(envelope)) {
              // Claim this envelope index so other parallel setupNock instances don't match it
              claimedIndices.add(i);
              envelopes.push(envelope);
              // Stop if we have enough envelopes
              if (envelopes.length >= count) {
                break;
              }
            }
          }
        }

        if (count === envelopes.length) {
          if (timeoutId) clearTimeout(timeoutId);
          if (checkInterval) clearInterval(checkInterval);

          if (endServer) {
            this._closeServer()
              .catch(e => {
                debug.warn(e);
              })
              .finally(() => {
                resolve(envelopes);
              });
          } else {
            resolve(envelopes);
          }
        }
      };

      // Check immediately and then poll every 50ms
      checkForEnvelopes();
      checkInterval = setInterval(checkForEnvelopes, 50);

      // Add a timeout to detect if Sentry requests never arrive
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        reject(new Error(`Timeout waiting for Sentry envelopes. Expected ${count}, got ${envelopes.length}`));
      }, 5000);
    });
  }

  public setAxiosConfig(axiosConfig: AxiosRequestConfig): void {
    this._axiosConfig = axiosConfig;
  }

  public async countEnvelopes(options: {
    url?: string;
    timeout?: number;
    envelopeType: EnvelopeItemType | EnvelopeItemType[];
  }): Promise<number> {
    return new Promise(resolve => {
      const envelopeTypeArray =
        typeof options.envelopeType === 'string' ? [options.envelopeType] : options.envelopeType;

      // Track the starting length to only count envelopes added after this call
      const globalEnvelopesArray = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];
      const startIndex = globalEnvelopesArray.length;

      setTimeout(() => {
        const globalEnvelopes = (globalThis as any).__SENTRY_TEST_ENVELOPES__ || [];
        // Only count envelopes that were added after this call started
        const newEnvelopes = globalEnvelopes.slice(startIndex);
        let reqCount = 0;

        for (const envelope of newEnvelopes) {
          // The parsed envelope format is [header, itemHeader, itemPayload]
          // where itemHeader has a 'type' property
          const itemHeader = envelope[1];
          if (itemHeader && envelopeTypeArray.includes(itemHeader.type as EnvelopeItemType)) {
            reqCount++;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._closeServer().then(() => {
          resolve(reqCount);
        });
      }, options.timeout || 1000);
    });
  }

  private _closeServer(): Promise<void> {
    return this._terminator.terminate();
  }
}

export class RemixTestEnv extends TestEnv {
  private constructor(
    public readonly server: http.Server,
    public readonly url: string,
  ) {
    super(server, url);
  }

  public static async init(): Promise<RemixTestEnv> {
    const app = express();

    // Import the build module dynamically
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const buildPath = path.resolve(__dirname, '../../../build/server/index.js');
    const build = await import(buildPath);

    const handler = createRequestHandler({ build });

    app.all('*', async (req, res, next) => {
      try {
        await handler(req, res);
      } catch (e) {
        next(e);
      }
    });

    return new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(new RemixTestEnv(server, `http://localhost:${address.port}`));
        } else {
          server.close();
          reject(new Error('Failed to start server: could not determine port'));
        }
      });

      server.on('error', reject);
    });
  }
}

const parseEnvelope = (body: string): Array<Record<string, unknown>> => {
  return body.split('\n').map(e => JSON.parse(e));
};

/**
 * Asserts against a Sentry Event ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryEvent = (actual: Event, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    ...expected,
  });
};

/**
 * Asserts against a Sentry Transaction ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryTransaction = (actual: TransactionEvent, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    start_timestamp: expect.anything(),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
};
