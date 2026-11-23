import { execFile } from 'child_process';
import { rmSync } from 'fs';
import { cp, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { PACKAGE_ROOT } from './createRunner';

const execFilePromise = promisify(execFile);

const dependencyInstalls = new Map<string, Promise<string>>();
const dependencyDirectories = new Set<string>();

process.once('exit', () => {
  for (const directory of dependencyDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

export async function installFixtureDependencies(
  directory: string,
  dependencies: Record<string, string>,
  reuseAllowed: boolean,
): Promise<void> {
  const deps = Object.entries(dependencies).map(([name, range]) => {
    if (!range || typeof range !== 'string') {
      throw new Error(`Invalid version range for "${name}": ${String(range)}`);
    }
    return `${name}@${range}`;
  });
  if (!process.env.CI || process.platform !== 'linux' || !reuseAllowed) {
    await npmInstallWithRetry(directory, deps);
    return;
  }

  const key = JSON.stringify(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
  const installation = getDependencyInstall(key, dependencies, deps);
  const source = await installation;
  try {
    await copyDependencyInstall(source, directory);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn('Dependency copy failed; installing fresh:', error);
    if (dependencyInstalls.get(key) === installation) {
      dependencyInstalls.delete(key);
    }
    await rm(join(directory, 'node_modules'), { recursive: true, force: true });
    await rm(join(directory, 'package-lock.json'), { force: true });
    await npmInstallWithRetry(directory, deps);
  }
}

async function copyDependencyInstall(source: string, destination: string): Promise<void> {
  // Native copying avoids the per-file overhead of fs.cp for large dependency trees.
  await execFilePromise('cp', [
    '-a',
    '--reflink=auto',
    join(source, 'node_modules'),
    join(destination, 'node_modules'),
  ]);
  await cp(join(source, 'package-lock.json'), join(destination, 'package-lock.json'));
}

function getDependencyInstall(key: string, dependencies: Record<string, string>, deps: string[]): Promise<string> {
  const existing = dependencyInstalls.get(key);
  if (existing) return existing;

  const installation = (async () => {
    const directory = await mkdtemp(join(PACKAGE_ROOT, 'tmp_dependencies_'));
    dependencyDirectories.add(directory);
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'tmp-integration-test', private: true, version: '0.0.0', dependencies }),
    );
    await npmInstallWithRetry(directory, deps);
    return directory;
  })();

  dependencyInstalls.set(key, installation);
  void installation.catch(() => {
    if (dependencyInstalls.get(key) === installation) {
      dependencyInstalls.delete(key);
    }
  });
  return installation;
}

const NPM_INSTALL_MAX_RETRIES = 3;
const NPM_INSTALL_RETRY_DELAY_MS = 2_000;
// npm install can stall on CI without ever failing, which would otherwise use up the whole setup hook timeout
// before a retry gets a chance to run.
const NPM_INSTALL_TIMEOUT_MS = 60_000;

async function npmInstallWithRetry(cwd: string, deps: string[]): Promise<void> {
  for (let attempt = 1; attempt <= NPM_INSTALL_MAX_RETRIES; attempt++) {
    try {
      // Run npm without a shell, so the timeout kills npm itself rather than leaving it running next to the retry
      const { stdout, stderr } = await execFilePromise(
        'npm',
        // We only use --prefer-offline on the first attempt to try to read from cache
        // in follow ups we just try to install in any way
        ['install', ...(attempt === 1 ? ['--prefer-offline'] : []), '--no-audit', '--no-fund'],
        {
          cwd,
          encoding: 'utf8',
          timeout: NPM_INSTALL_TIMEOUT_MS,
        },
      );

      if (process.env.DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[additionalDependencies via npm]', deps.join(' '));
        // eslint-disable-next-line no-console
        console.log('[npm stdout]', stdout);
        // eslint-disable-next-line no-console
        console.log('[npm stderr]', stderr);
      }
      return;
    } catch (error) {
      if (attempt < NPM_INSTALL_MAX_RETRIES) {
        // eslint-disable-next-line no-console
        console.warn(
          `npm install attempt ${attempt}/${NPM_INSTALL_MAX_RETRIES} failed, retrying in ${NPM_INSTALL_RETRY_DELAY_MS}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, NPM_INSTALL_RETRY_DELAY_MS));
        // A killed attempt leaves a partial install behind, which the next attempt would treat as complete
        await rm(join(cwd, 'node_modules'), { recursive: true, force: true });
        await rm(join(cwd, 'package-lock.json'), { force: true });
      } else {
        // oxlint-disable-next-line no-console
        console.error(error);
        throw new Error(
          `Failed to install additionalDependencies in tmp dir ${cwd} after ${NPM_INSTALL_MAX_RETRIES} attempts`,
        );
      }
    }
  }
}
