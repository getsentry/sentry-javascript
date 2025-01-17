import { arch as _arch, platform as _platform } from 'node:os';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { env, versions } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { threadId } from 'node:worker_threads';
import { familySync } from 'detect-libc';
import { getAbi } from 'node-abi';

import { GLOBAL_OBJ, logger } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type {
  PrivateV8CpuProfilerBindings,
  RawChunkCpuProfile,
  RawThreadCpuProfile,
  V8CpuProfilerBindings,
} from './types';
import type { ProfileFormat } from './types';

declare const __IMPORT_META_URL_REPLACEMENT__: string;
declare const __LOAD_MODULE_REPLACEMENT__: (path: string) => PrivateV8CpuProfilerBindings;
declare const __CREATE_REQUIRE__: string;

const stdlib = familySync();
const platform = process.env['BUILD_PLATFORM'] || _platform();
const arch = process.env['BUILD_ARCH'] || _arch();
const abi = getAbi(versions.node, 'node');
const identifier = [platform, arch, stdlib, abi].filter(c => c !== undefined && c !== null).join('-');

/**
 *  Imports cpp bindings based on the current platform and architecture.
 */
// eslint-disable-next-line complexity
export function importCppBindingsModule(): PrivateV8CpuProfilerBindings {
  // We need to work around using import.meta.url directly with __IMPORT_META_URL_REPLACEMENT__ because jest complains about it.
  const importMetaUrl =
    typeof __IMPORT_META_URL_REPLACEMENT__ !== 'undefined'
      ? // This case is always hit when the SDK is built
        __IMPORT_META_URL_REPLACEMENT__
      : // This case is hit when the tests are run
        pathToFileURL(__filename).href;

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  // __CREATE_REQUIRE__;

  // const createdRequire = createRequire(importMetaUrl);
  const esmCompatibleDirname = dirname(fileURLToPath(importMetaUrl));

  // If a binary path is specified, use that.
  if (env['SENTRY_PROFILER_BINARY_PATH']) {
    const envPath = env['SENTRY_PROFILER_BINARY_PATH'];
    return __LOAD_MODULE_REPLACEMENT__(envPath);
  }

  // If a user specifies a different binary dir, they are in control of the binaries being moved there
  if (env['SENTRY_PROFILER_BINARY_DIR']) {
    const binaryPath = join(resolve(env['SENTRY_PROFILER_BINARY_DIR']), `sentry_cpu_profiler-${identifier}`);
    return __LOAD_MODULE_REPLACEMENT__(`${binaryPath}.node`);
  }

  // We need the fallthrough so that in the end, we can fallback to the dynamic require.
  // This is for cases where precompiled binaries were not provided, but may have been compiled from source.
  if (platform === 'darwin') {
    if (arch === 'x64') {
      if (abi === '93') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-x64-93.node');
      }
      if (abi === '108') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-x64-108.node');
      }
      if (abi === '115') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-x64-115.node');
      }
      if (abi === '127') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-x64-127.node');
      }
    }

    if (arch === 'arm64') {
      if (abi === '93') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-arm64-93.node');
      }
      if (abi === '108') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-arm64-108.node');
      }
      if (abi === '115') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-arm64-115.node');
      }
      if (abi === '127') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-darwin-arm64-127.node');
      }
    }
  }

  if (platform === 'win32') {
    if (arch === 'x64') {
      if (abi === '93') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-win32-x64-93.node');
      }
      if (abi === '108') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-win32-x64-108.node');
      }
      if (abi === '115') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-win32-x64-115.node');
      }
      if (abi === '127') {
        return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-win32-x64-127.node');
      }
    }
  }

  if (platform === 'linux') {
    if (arch === 'x64') {
      if (stdlib === 'musl') {
        if (abi === '93') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-musl-93.node');
        }
        if (abi === '108') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-musl-108.node');
        }
        if (abi === '115') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-musl-115.node');
        }
        if (abi === '127') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-musl-127.node');
        }
      }
      if (stdlib === 'glibc') {
        if (abi === '93') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-glibc-93.node');
        }
        if (abi === '108') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-glibc-108.node');
        }
        if (abi === '115') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-glibc-115.node');
        }
        if (abi === '127') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-x64-glibc-127.node');
        }
      }
    }
    if (arch === 'arm64') {
      if (stdlib === 'musl') {
        if (abi === '93') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-musl-93.node');
        }
        if (abi === '108') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-musl-108.node');
        }
        if (abi === '115') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-musl-115.node');
        }
        if (abi === '127') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-musl-127.node');
        }
      }

      if (stdlib === 'glibc') {
        if (abi === '93') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-glibc-93.node');
        }
        if (abi === '108') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-glibc-108.node');
        }
        if (abi === '115') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-glibc-115.node');
        }
        if (abi === '127') {
          return __LOAD_MODULE_REPLACEMENT__('../sentry_cpu_profiler-linux-arm64-glibc-127.node');
        }
      }
    }
  }

  const built_from_source_path = resolve(esmCompatibleDirname, '..', `sentry_cpu_profiler-${identifier}`);
  return __LOAD_MODULE_REPLACEMENT__(`${built_from_source_path}.node`);
}

const PrivateCpuProfilerBindings: PrivateV8CpuProfilerBindings = importCppBindingsModule();

class Bindings implements V8CpuProfilerBindings {
  public startProfiling(name: string): void {
    if (!PrivateCpuProfilerBindings) {
      DEBUG_BUILD && logger.log('[Profiling] Bindings not loaded, ignoring call to startProfiling.');
      return;
    }

    if (typeof PrivateCpuProfilerBindings.startProfiling !== 'function') {
      DEBUG_BUILD &&
        logger.log('[Profiling] Native startProfiling function is not available, ignoring call to startProfiling.');
      return;
    }

    return PrivateCpuProfilerBindings.startProfiling(name);
  }

  public stopProfiling(name: string, format: ProfileFormat.THREAD): RawThreadCpuProfile | null;
  public stopProfiling(name: string, format: ProfileFormat.CHUNK): RawChunkCpuProfile | null;
  public stopProfiling(
    name: string,
    format: ProfileFormat.CHUNK | ProfileFormat.THREAD,
  ): RawThreadCpuProfile | RawChunkCpuProfile | null {
    if (!PrivateCpuProfilerBindings) {
      DEBUG_BUILD &&
        logger.log('[Profiling] Bindings not loaded or profile was never started, ignoring call to stopProfiling.');
      return null;
    }

    if (typeof PrivateCpuProfilerBindings.stopProfiling !== 'function') {
      DEBUG_BUILD &&
        logger.log('[Profiling] Native stopProfiling function is not available, ignoring call to stopProfiling.');
      return null;
    }

    return PrivateCpuProfilerBindings.stopProfiling(
      name,
      format as unknown as any,
      threadId,
      !!GLOBAL_OBJ._sentryDebugIds,
    );
  }
}

const CpuProfilerBindings = new Bindings();

export { PrivateCpuProfilerBindings };
export { CpuProfilerBindings };
