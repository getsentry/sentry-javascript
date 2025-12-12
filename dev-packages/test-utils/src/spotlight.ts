import type { Envelope, EnvelopeItem, Event, SerializedSession } from '@sentry/core';
import { parseEnvelope } from '@sentry/core';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

/**
 * Get the directory name, works in both CJS and ESM environments.
 */
function getDirname(): string {
  // ESM environment
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  // CJS environment
  return __dirname;
}

/**
 * Find the monorepo root by looking for a package.json with workspaces.
 * This works regardless of whether we're running from source or built output.
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { workspaces?: string[] };
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // Continue searching
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find monorepo root');
}

// Find spotlight binary in repo root's node_modules
const REPO_ROOT = findRepoRoot(getDirname());
const SPOTLIGHT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'spotlight');

interface SpotlightOptions {
  /** Port for the Spotlight sidecar. Use 0 for dynamic port assignment. */
  port?: number;
  /** Port for the app to run on. Defaults to 3030. */
  appPort?: number;
  /** Working directory for the child process (where package.json is located) */
  cwd?: string;
  /** Whether to enable debug output */
  debug?: boolean;
  /** Additional environment variables to pass to the process */
  env?: Record<string, string>;
}

interface SpotlightInstance {
  /** The child process running Spotlight */
  process: ChildProcess;
  /** The port Spotlight is running on */
  port: number;
  /** Stream of parsed Sentry envelopes */
  envelopes: AsyncGenerator<Envelope, void, unknown>;
  /** Stop the Spotlight process */
  stop: () => void;
}

interface SpotlightJsonEvent {
  type: 'envelope' | 'log' | 'error';
  timestamp: string;
  data?: string; // Base64 encoded envelope for 'envelope' type
  message?: string; // For 'log' and 'error' types
  level?: string;
}

// Global state to track the current Spotlight instance for this test run
let currentSpotlightInstance: SpotlightInstance | null = null;
const eventBuffer: Envelope[] = [];
const eventListeners: Set<(envelope: Envelope) => void> = new Set();

/**
 * Start Spotlight sidecar with the given options.
 * This function spawns `spotlight run` which automatically:
 * - Detects and runs the start script from package.json
 * - Starts the Spotlight sidecar
 * - Streams events in JSON format (with -f json flag)
 */
export async function startSpotlight(options: SpotlightOptions = {}): Promise<SpotlightInstance> {
  const { port = 0, appPort = 3030, cwd = process.cwd(), debug = false, env = {} } = options;

  return new Promise((resolve, reject) => {
    // Run Spotlight directly from repo root's node_modules
    const args = ['run', '-f', 'json'];

    if (port !== 0) {
      args.push('-p', String(port));
    }

    if (debug) {
      args.push('-d');
    }

    const spotlightProcess = spawn(SPOTLIGHT_BIN, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env,
        PORT: String(appPort),
      },
    });

    let resolvedPort: number | null = null;
    let resolved = false;

    // Parse stderr for port information
    // Spotlight outputs something like "Spotlight listening on http://localhost:8969"
    if (!spotlightProcess.stderr || !spotlightProcess.stdout) {
      reject(new Error('Spotlight process has no stdout/stderr'));
      return;
    }

    const stderrReader = readline.createInterface({
      input: spotlightProcess.stderr,
      crlfDelay: Infinity,
    });

    // Helper to poll the app port until it's ready
    const waitForAppReady = async (): Promise<void> => {
      const maxAttempts = 60; // 30 seconds
      for (let i = 0; i < maxAttempts; i++) {
        try {
          await new Promise<void>((resolveCheck, rejectCheck) => {
            const req = http.get(`http://localhost:${appPort}/`, res => {
              res.resume();
              resolveCheck();
            });
            req.on('error', rejectCheck);
            req.setTimeout(500, () => {
              req.destroy();
              rejectCheck(new Error('timeout'));
            });
          });
          return; // App is ready
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      throw new Error(`App did not start on port ${appPort} within 30 seconds`);
    };

    stderrReader.on('line', (line: string) => {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[spotlight stderr]', line);
      }

      // Look for port in various formats:
      // - "Spotlight listening on 39143"
      // - "http://localhost:8969"
      // - "port: 8969"
      const portMatch =
        line.match(/listening on (\d+)/i) || line.match(/localhost:(\d+)/i) || line.match(/port[:\s]+(\d+)/i);

      if (portMatch?.[1] && !resolvedPort) {
        resolvedPort = parseInt(portMatch[1], 10);
      }

      // When Spotlight says it's listening, start waiting for the app
      if (!resolved && resolvedPort && line.includes('listening')) {
        resolved = true;
        const spotlightPort = resolvedPort; // Capture for closure
        // Wait for app to be ready before resolving
        waitForAppReady()
          .then(() => {
            const instance = createSpotlightInstance(spotlightProcess, spotlightPort, debug);
            currentSpotlightInstance = instance;
            resolve(instance);
          })
          .catch(reject);
      }
    });

    // Parse stdout for JSON events
    const stdoutReader = readline.createInterface({
      input: spotlightProcess.stdout,
      crlfDelay: Infinity,
    });

    stdoutReader.on('line', (line: string) => {
      if (!line.trim()) return;

      try {
        const event: SpotlightJsonEvent = JSON.parse(line);

        if (event.type === 'envelope' && event.data) {
          // Decode base64 envelope data
          const envelopeString = Buffer.from(event.data, 'base64').toString('utf8');
          const envelope = parseEnvelope(envelopeString);

          // Add to buffer and notify listeners
          eventBuffer.push(envelope);
          eventListeners.forEach(listener => listener(envelope));
        }
      } catch {
        // Not a JSON line or parse error - might be app output
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[spotlight stdout]', line);
        }
      }
    });

    spotlightProcess.on('error', err => {
      if (!resolved) {
        reject(new Error(`Failed to start Spotlight: ${err.message}`));
      }
    });

    spotlightProcess.on('exit', (code, signal) => {
      if (!resolved) {
        reject(new Error(`Spotlight exited before ready with code ${code}, signal ${signal}`));
      }
      currentSpotlightInstance = null;
    });

    // Timeout if Spotlight doesn't start within 30 seconds
    setTimeout(() => {
      if (!resolved) {
        spotlightProcess.kill();
        reject(new Error('Timeout waiting for Spotlight to start'));
      }
    }, 30000);
  });
}

function createSpotlightInstance(process: ChildProcess, port: number, _debug: boolean): SpotlightInstance {
  async function* envelopeGenerator(): AsyncGenerator<Envelope, void, unknown> {
    let bufferIndex = 0;

    while (true) {
      // Yield any buffered events first
      while (bufferIndex < eventBuffer.length) {
        const envelope = eventBuffer[bufferIndex++];
        if (envelope) {
          yield envelope;
        }
      }

      // Wait for new events
      const envelope = await new Promise<Envelope>(resolve => {
        const listener = (env: Envelope): void => {
          eventListeners.delete(listener);
          resolve(env);
        };
        eventListeners.add(listener);
      });

      yield envelope;
      bufferIndex++;
    }
  }

  return {
    process,
    port,
    envelopes: envelopeGenerator(),
    stop: () => {
      process.kill();
      currentSpotlightInstance = null;
      eventBuffer.length = 0;
      eventListeners.clear();
    },
  };
}

/**
 * Get the DSN to use for Spotlight.
 * This uses the DSN workaround format that works with all SDKs.
 */
export function getSpotlightDsn(port: number): string {
  return `http://spotlight@localhost:${port}/0`;
}

/**
 * Wait for a specific envelope item from Spotlight.
 */
export function waitForEnvelopeItem(
  callback: (envelopeItem: EnvelopeItem) => Promise<boolean> | boolean,
): Promise<EnvelopeItem> {
  return new Promise((resolve, reject) => {
    const checkEnvelope = async (envelope: Envelope): Promise<boolean> => {
      const envelopeItems = envelope[1];
      for (const envelopeItem of envelopeItems) {
        const result = callback(envelopeItem);
        const matches = typeof result === 'boolean' ? result : await result;
        if (matches) {
          resolve(envelopeItem);
          return true;
        }
      }
      return false;
    };

    // Check buffered events first
    (async () => {
      for (const envelope of eventBuffer) {
        if (await checkEnvelope(envelope)) {
          return;
        }
      }

      // Listen for new events
      const listener = async (envelope: Envelope): Promise<void> => {
        if (await checkEnvelope(envelope)) {
          eventListeners.delete(listener);
        }
      };
      eventListeners.add(listener);
    })().catch(reject);

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Timeout waiting for envelope item'));
    }, 30000);
  });
}

/**
 * Wait for an error event from Spotlight.
 */
export function waitForError(callback: (errorEvent: Event) => Promise<boolean> | boolean): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(async envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'event') {
        const result = callback(envelopeItemBody as Event);
        const matches = typeof result === 'boolean' ? result : await result;
        if (matches) {
          resolve(envelopeItemBody as Event);
          return true;
        }
      }
      return false;
    }).catch(reject);
  });
}

/**
 * Wait for a session from Spotlight.
 */
export function waitForSession(
  callback: (session: SerializedSession) => Promise<boolean> | boolean,
): Promise<SerializedSession> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(async envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'session') {
        const result = callback(envelopeItemBody as SerializedSession);
        const matches = typeof result === 'boolean' ? result : await result;
        if (matches) {
          resolve(envelopeItemBody as SerializedSession);
          return true;
        }
      }
      return false;
    }).catch(reject);
  });
}

/**
 * Wait for a transaction event from Spotlight.
 */
export function waitForTransaction(callback: (transactionEvent: Event) => Promise<boolean> | boolean): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(async envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'transaction') {
        const result = callback(envelopeItemBody as Event);
        const matches = typeof result === 'boolean' ? result : await result;
        if (matches) {
          resolve(envelopeItemBody as Event);
          return true;
        }
      }
      return false;
    }).catch(reject);
  });
}

/**
 * Clear the event buffer. Call this between tests to ensure clean state.
 */
export function clearEventBuffer(): void {
  eventBuffer.length = 0;
}

/**
 * Get the current Spotlight instance, if any.
 */
export function getCurrentSpotlightInstance(): SpotlightInstance | null {
  return currentSpotlightInstance;
}
