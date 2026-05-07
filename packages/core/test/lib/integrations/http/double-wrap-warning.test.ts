import { it, expect, describe, vi } from 'vitest';
import { doubleWrapWarning, warning } from '../../../../src/integrations/http/double-wrap-warning';
import type { HttpModuleExport } from '../../../../src/integrations/http/types';

const DEBUG_WARNS: string[] = [];
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: {
    warn: (msg: string) => {
      DEBUG_WARNS.push(msg);
    },
  },
}));

// must be var, because vi.mock hoists
var debugBuild: boolean = true;
vi.mock(import('../../../../src/debug-build'), () => ({
  get DEBUG_BUILD() {
    return debugBuild ?? true;
  },
}));

describe('doubleWrapWarning', () => {
  it('prints no warning if http.request/get not wrapped', () => {
    doubleWrapWarning({
      request() {},
      get() {},
    } as unknown as HttpModuleExport);
    expect(DEBUG_WARNS).toStrictEqual([]);
  });

  it('prints exactly one warning if http.request/get are wrapped', () => {
    doubleWrapWarning({
      request: Object.assign(() => {}, { __unwrap() {} }),
      get: Object.assign(() => {}, { __unwrap() {} }),
    } as unknown as HttpModuleExport);
    doubleWrapWarning({
      request: Object.assign(() => {}, { __unwrap() {} }),
      get: Object.assign(() => {}, { __unwrap() {} }),
    } as unknown as HttpModuleExport);
    doubleWrapWarning({
      request: Object.assign(() => {}, { __unwrap() {} }),
      get: Object.assign(() => {}, { __unwrap() {} }),
    } as unknown as HttpModuleExport);
    expect(DEBUG_WARNS).toStrictEqual([warning]);
    DEBUG_WARNS.length = 0;
  });

  it('is a no-op if not in debug mode', async () => {
    vi.resetModules();
    debugBuild = false;
    const { doubleWrapWarning } = await import('../../../../src/integrations/http/double-wrap-warning');
    doubleWrapWarning({
      request: Object.assign(() => {}, { __unwrap() {} }),
      get: Object.assign(() => {}, { __unwrap() {} }),
    } as unknown as HttpModuleExport);
    expect(DEBUG_WARNS).toStrictEqual([]);
    DEBUG_WARNS.length = 0;
  });
});
