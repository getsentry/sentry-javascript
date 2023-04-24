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

export function spawnAsync(
  cmd: string,
  options?:
    | childProcess.SpawnOptionsWithoutStdio
    | childProcess.SpawnOptionsWithStdioTuple<childProcess.StdioPipe, childProcess.StdioPipe, childProcess.StdioPipe>,
  input?: string,
): Promise<SpawnAsync> {
  const start = Date.now();

  return new Promise<SpawnAsync>(resolve => {
    const cp = childProcess.spawn(cmd, { shell: true, ...options });

    const stderr: unknown[] = [];
    const stdout: string[] = [];
    let error: Error | undefined;

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
      const end = Date.now();

      // We manually mark this as timed out if the process takes too long
      if (!error && status === 1 && options?.timeout && end >= start + options.timeout) {
        error = new Error(`ETDIMEDOUT: Process timed out after ${options.timeout} ms.`);
      }

      resolve({
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        error: error || (status !== 0 ? new Error(`Process exited with status ${status}`) : undefined),
        status,
      });
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
