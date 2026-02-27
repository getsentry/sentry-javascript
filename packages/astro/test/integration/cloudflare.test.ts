import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryAstro } from '../../src/integration';

const getWranglerConfig = vi.hoisted(() => vi.fn());

vi.mock('fs', async requireActual => {
  return {
    ...(await requireActual<any>()),
    existsSync: vi.fn((p: string) => {
      const wranglerConfig = getWranglerConfig();

      if (wranglerConfig && p.includes(wranglerConfig.filename)) {
        return true;
      }
      return false;
    }),
    readFileSync: vi.fn(() => {
      const wranglerConfig = getWranglerConfig();

      if (wranglerConfig) {
        return wranglerConfig.content;
      }
      return '';
    }),
  };
});

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi.fn(() => 'sentryVitePlugin'),
}));

vi.mock('../../src/integration/cloudflare', () => ({
  sentryCloudflareNodeWarningPlugin: vi.fn(() => 'sentryCloudflareNodeWarningPlugin'),
  sentryCloudflareVitePlugin: vi.fn(() => 'sentryCloudflareVitePlugin'),
}));

const baseConfigHookObject = vi.hoisted(() => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  injectScript: vi.fn(),
  updateConfig: vi.fn(),
}));

describe('Cloudflare Pages vs Workers detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWranglerConfig.mockReturnValue(null);
  });

  describe('Cloudflare Workers (no pages_build_output_dir)', () => {
    it('adds Cloudflare Vite plugins for Workers production build', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.json',
        content: JSON.stringify({
          main: 'dist/_worker.js/index.js',
          assets: { directory: './dist' },
        }),
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          vite: expect.objectContaining({
            plugins: expect.arrayContaining(['sentryCloudflareNodeWarningPlugin', 'sentryCloudflareVitePlugin']),
          }),
        }),
      );
    });

    it('adds Cloudflare Vite plugins when no wrangler config exists', async () => {
      getWranglerConfig.mockReturnValue(null);

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          vite: expect.objectContaining({
            plugins: expect.arrayContaining(['sentryCloudflareNodeWarningPlugin', 'sentryCloudflareVitePlugin']),
          }),
        }),
      );
    });
  });

  describe('Cloudflare Pages (with pages_build_output_dir)', () => {
    it('does not show warning for Pages project with wrangler.json', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.json',
        content: JSON.stringify({
          pages_build_output_dir: './dist',
        }),
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.logger.error).not.toHaveBeenCalled();
    });

    it('does not show warning for Pages project with wrangler.jsonc', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.jsonc',
        content: `{
          // This is a comment
          "pages_build_output_dir": "./dist"
        }`,
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.logger.error).not.toHaveBeenCalled();
    });

    it('does not show warning for Pages project with wrangler.toml', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.toml',
        content: `
name = "my-astro-app"
pages_build_output_dir = "./dist"
        `,
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.logger.error).not.toHaveBeenCalled();
    });

    it('does not add Cloudflare Vite plugins for Pages production build', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.json',
        content: JSON.stringify({
          pages_build_output_dir: './dist',
        }),
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'build',
      });

      // Check that sentryCloudflareVitePlugin is NOT in any of the calls
      expect(baseConfigHookObject.updateConfig).toHaveBeenCalledWith(
        { vite: expect.objectContaining({ plugins: ['sentryCloudflareNodeWarningPlugin'] }) },
      );
    });

    it('still adds SSR noExternal config for Pages in dev mode', async () => {
      getWranglerConfig.mockReturnValue({
        filename: 'wrangler.json',
        content: JSON.stringify({
          pages_build_output_dir: './dist',
        }),
      });

      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/cloudflare' },
        },
        command: 'dev',
      });

      expect(baseConfigHookObject.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          vite: expect.objectContaining({
            ssr: expect.objectContaining({
              noExternal: ['@sentry/astro', '@sentry/node'],
            }),
          }),
        }),
      );
    });
  });

  describe('Non-Cloudflare adapters', () => {
    it('does not show Cloudflare warning for other adapters', async () => {
      const integration = sentryAstro({});

      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        config: {
          // @ts-expect-error - we only need to pass what we actually use
          adapter: { name: '@astrojs/vercel' },
        },
        command: 'build',
      });

      expect(baseConfigHookObject.logger.error).not.toHaveBeenCalled();
    });
  });
});
