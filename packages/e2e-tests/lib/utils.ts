/* eslint-disable no-console */
import * as childProcess from 'child_process';

// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message
export function printCIErrorMessage(message: string): void {
  if (process.env.CI) {
    console.log(`::error::${message}`);
  } else {
    console.log(message);
  }
}

interface SpawnAsync {
  stdout: string;
  stderr: string;
  error?: Error;
  status: number | null;
}

interface SpawnOptions {
  timeout?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env?: any;
  cwd?: string;
}

export function spawnAsync(cmd: string, options?: SpawnOptions, input?: string): Promise<SpawnAsync> {
  const timeoutMs = options?.timeout || 60_000 * 5;

  return new Promise<SpawnAsync>(resolve => {
    const cp = childProcess.spawn(cmd, { shell: true, ...options });

    // Ensure we properly time out after max. 5 min per command
    let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      console.log(`Command "${cmd}" timed out after 5 minutes.`);
      cp.kill();
      end(null, `ETDIMEDOUT: Process timed out after ${timeoutMs} ms.`);
    }, timeoutMs);

    const stderr: unknown[] = [];
    const stdout: string[] = [];
    let error: Error | undefined;

    function end(status: number | null, errorMessage?: string): void {
      // This means we already ended
      if (!timeout) {
        return;
      }

      if (!error && errorMessage) {
        error = new Error(errorMessage);
      }

      clearTimeout(timeout);
      timeout = undefined;
      resolve({
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        error: error || (status !== 0 ? new Error(`Process exited with status ${status}`) : undefined),
        status,
      });
    }

    cp.stdout.on('data', data => {
      stdout.push(data ? (data as object).toString() : '');
    });

    cp.stderr.on('data', data => {
      stderr.push(data ? (data as object).toString() : '');
    });

    cp.on('error', e => {
      error = e;
    });

    cp.on('close', status => {
      end(status);
    });

    if (input) {
      cp.stdin.write(input);
      cp.stdin.end();
    }
  });
}

export function prefixObjectKeys(
  obj: Record<string, string | undefined>,
  prefix: string,
): Record<string, string | undefined> {
  return Object.keys(obj).reduce<Record<string, string | undefined>>((result, key) => {
    result[prefix + key] = obj[key];
    return result;
  }, {});
}
