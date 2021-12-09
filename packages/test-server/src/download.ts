import { existsSync, mkdir, writeFile } from 'fs';
import * as got from 'got';
import { join } from 'path';
import { promisify } from 'util';

const mkdirAsync = promisify(mkdir);
const writeFileAsync = promisify(writeFile);

function getBinaryName(): string {
  switch (process.platform) {
    case 'win32':
      return 'relay-Windows-x86_64.exe';
    case 'darwin':
      return 'relay-Darwin-x86_64';
    case 'linux':
      return 'relay-Linux-x86_64';
  }

  throw new Error('Unknown platform');
}

function getReleaseUrl(binaryName: string): string {
  return `https://github.com/getsentry/relay/releases/latest/download/${binaryName}`;
}

function getCachePath(): string {
  return process.env.RELAY_CACHE_PATH || join(process.cwd(), '.cache');
}

/** Downloads relay to the cached path */
export async function downloadAndCacheBinary(): Promise<string> {
  const cachePath = getCachePath();
  await mkdirAsync(cachePath, { recursive: true });
  const binaryName = getBinaryName();
  const binaryPath = join(cachePath, binaryName);

  if (!existsSync(binaryPath)) {
    const buffer = await got.default.get(getReleaseUrl(binaryName)).buffer();
    await writeFileAsync(binaryPath, buffer);
  }

  return binaryPath;
}
