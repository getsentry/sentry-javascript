import { describe, expect, it } from 'vitest';
import { makeServerBuildCapturePlugin } from '../../src/vite/makeServerBuildCapturePlugin';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';
const SERVER_BUILD_CODE = 'const routes = {}; export { routes, entry, future };';

describe('makeServerBuildCapturePlugin', () => {
  it('should create a plugin with the correct name and enforce post', () => {
    const plugin = makeServerBuildCapturePlugin();
    expect(plugin.name).toBe('sentry-react-router-server-build-capture');
    expect(plugin.enforce).toBe('post');
  });

  it('should return null for non-SSR builds', () => {
    const plugin = makeServerBuildCapturePlugin();
    (plugin as any).configResolved({ build: { ssr: false } });

    const result = (plugin as any).transform(SERVER_BUILD_CODE, SERVER_BUILD_MODULE_ID);

    expect(result).toBeNull();
  });

  it('should return null for non-server-build modules in SSR mode', () => {
    const plugin = makeServerBuildCapturePlugin();
    (plugin as any).configResolved({ build: { ssr: true } });

    const result = (plugin as any).transform('export function helper() {}', 'src/utils.ts');

    expect(result).toBeNull();
  });

  it('should inject capture snippet into the server build module in SSR mode', () => {
    const plugin = makeServerBuildCapturePlugin();
    (plugin as any).configResolved({ build: { ssr: true } });

    const result = (plugin as any).transform(SERVER_BUILD_CODE, SERVER_BUILD_MODULE_ID);

    expect(result).not.toBeNull();
    expect(result.code).toContain(SERVER_BUILD_CODE);
    expect(result.code).toContain('__sentrySetServerBuild');
    expect(result.code).toContain('({ routes })');
    expect(result.map).toBeNull();
  });
});
