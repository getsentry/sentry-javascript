import { spawn } from 'node:child_process';

export interface NodeServerOptions {
  /** Path to the server entry, e.g. `.output/server/index.mjs`. */
  entry: string;
  port: number;
  /** How long to wait for the first response. Defaults to 30 seconds. */
  timeoutMs?: number;
}

export interface NodeServer {
  baseUrl: string;
  /** Stops the server and resolves once its process has exited. */
  close: () => Promise<void>;
}

/**
 * Starts a built Node server and resolves once it answers HTTP requests. The server gets the port via `PORT`.
 *
 * Rejects if the server exits or does not answer before the timeout. Its output is printed only then.
 */
export async function startNodeServer({ entry, port, timeoutMs = 30_000 }: NodeServerOptions): Promise<NodeServer> {
  const baseUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(port) } });

  let output = '';
  child.stdout.on('data', chunk => (output += chunk));
  child.stderr.on('data', chunk => (output += chunk));

  const close = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server ${entry} exited with code ${child.exitCode} before it answered:\n${output}`);
    }

    try {
      await fetch(baseUrl);
      return { baseUrl, close };
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  await close();
  throw new Error(`Server ${entry} did not answer on ${baseUrl} within ${timeoutMs}ms:\n${output}`);
}
