import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';
import { PACKAGE_ROOT } from './createRunner';

const execFilePromise = promisify(execFile);

interface DependencyInstall {
  directory: string;
  manifest: string;
}

const dependencyInstalls = new Map<string, Promise<DependencyInstall>>();

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

  const installed = await getDependencyInstall(dependencies, deps);
  try {
    await copyDependencyInstall(installed.directory, directory);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn('Dependency copy failed; installing fresh:', error);
    dependencyInstalls.delete(installed.manifest);
    await rm(installed.manifest, { force: true });
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

function getDependencyInstall(dependencies: Record<string, string>, deps: string[]): Promise<DependencyInstall> {
  const key = createHash('sha256')
    .update(
      JSON.stringify({
        key: JSON.stringify(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
        node: process.version,
        arch: process.arch,
        platform: process.platform,
      }),
    )
    .digest('hex');
  const cacheRoot = join(PACKAGE_ROOT, '.integration-dependency-cache');
  const manifest = join(cacheRoot, `${key}.json`);
  const existing = dependencyInstalls.get(manifest);
  if (existing) return existing;

  const installation = prepareDependencyInstall(cacheRoot, manifest, key, dependencies, deps);
  dependencyInstalls.set(manifest, installation);
  void installation.catch(() => dependencyInstalls.delete(manifest));
  return installation;
}

async function prepareDependencyInstall(
  cacheRoot: string,
  manifest: string,
  key: string,
  dependencies: Record<string, string>,
  deps: string[],
): Promise<DependencyInstall> {
  await mkdir(cacheRoot, { recursive: true });
  try {
    const stored = JSON.parse(await readFile(manifest, 'utf8')) as { key: string; directory: string };
    if (
      stored.key === key &&
      typeof stored.directory === 'string' &&
      stored.directory.startsWith('entry_') &&
      basename(stored.directory) === stored.directory
    ) {
      const directory = join(cacheRoot, stored.directory);
      if (existsSync(join(directory, 'node_modules')) && existsSync(join(directory, 'package-lock.json'))) {
        return { directory, manifest };
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // oxlint-disable-next-line no-console
      console.warn('Ignoring invalid dependency cache entry:', error);
    }
  }

  const directory = await mkdtemp(join(cacheRoot, 'entry_'));
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'tmp-integration-test', private: true, version: '0.0.0', dependencies }),
  );
  await npmInstallWithRetry(directory, deps);

  // Other workers must only discover installations after npm has completed successfully.
  const pendingManifest = `${manifest}.${basename(directory)}.tmp`;
  await writeFile(pendingManifest, JSON.stringify({ key, directory: basename(directory) }));
  await rename(pendingManifest, manifest);
  return { directory, manifest };
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
