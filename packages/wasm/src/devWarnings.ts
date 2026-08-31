import { consoleSandbox } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

const seen = new Set<string>();

function missingBuildIdWarning(url: string): { id: string; message: string } {
  return {
    id: `missing-build-id:${url}`,
    message: `WebAssembly module "${url}" has no build_id section, so stack traces cannot be symbolicated. Rebuild with a build ID and upload debug files with sentry-cli.`,
  };
}

/** Dev-only, deduped console warning. No-op in production SDK builds. */
export function devWarnOnce(id: string, message: string): void {
  if (!DEBUG_BUILD || seen.has(id)) {
    return;
  }

  seen.add(id);
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(`[@sentry/wasm] ${message}`);
  });
}

/** Warn on the current thread when a wasm module has no build_id section. */
export function warnMissingBuildId(url: string): void {
  const { id, message } = missingBuildIdWarning(url);
  devWarnOnce(id, message);
}

/** Worker → main thread message when build_id is missing. */
export function missingBuildIdWorkerMessage(url: string): {
  _sentryMessage: true;
  _sentryWasmDevWarning: { id: string; message: string };
} {
  return {
    _sentryMessage: true,
    _sentryWasmDevWarning: missingBuildIdWarning(url),
  };
}

/** @internal */
export function _resetDevWarningsForTests(): void {
  seen.clear();
}
