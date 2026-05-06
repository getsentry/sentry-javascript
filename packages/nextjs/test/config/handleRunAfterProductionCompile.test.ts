import { loadModule } from '@sentry/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleRunAfterProductionCompile,
  stripSourceMappingURLComments,
} from '../../src/config/handleRunAfterProductionCompile';
import type { SentryBuildOptions } from '../../src/config/types';

vi.mock('@sentry/core', () => ({
  loadModule: vi.fn(),
}));

vi.mock('../../src/config/getBuildPluginOptions', () => ({
  getBuildPluginOptions: vi.fn(() => ({
    org: 'test-org',
    project: 'test-project',
    sourcemaps: {},
  })),
}));

describe('handleRunAfterProductionCompile', () => {
  const mockCreateSentryBuildPluginManager = vi.fn();
  const mockSentryBuildPluginManager = {
    telemetry: {
      emitBundlerPluginExecutionSignal: vi.fn().mockResolvedValue(undefined),
    },
    createRelease: vi.fn().mockResolvedValue(undefined),
    injectDebugIds: vi.fn().mockResolvedValue(undefined),
    uploadSourcemaps: vi.fn().mockResolvedValue(undefined),
    deleteArtifacts: vi.fn().mockResolvedValue(undefined),
  };

  const mockSentryBuildOptions: SentryBuildOptions = {
    org: 'test-org',
    project: 'test-project',
    authToken: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSentryBuildPluginManager.mockReturnValue(mockSentryBuildPluginManager);
    (loadModule as any).mockReturnValue({
      createSentryBuildPluginManager: mockCreateSentryBuildPluginManager,
    });
  });

  describe('turbopack builds', () => {
    it('executes all build steps for turbopack builds', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.createRelease).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith(['/path/to/.next'], {
        prepareArtifacts: false,
      });
      expect(mockSentryBuildPluginManager.deleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('calls createSentryBuildPluginManager with correct options', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          org: 'test-org',
          project: 'test-project',
          sourcemaps: expect.any(Object),
        }),
        {
          buildTool: 'turbopack',
          loggerPrefix: '[@sentry/nextjs - After Production Compile]',
        },
      );
    });

    it('handles debug mode correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const debugOptions = {
        ...mockSentryBuildOptions,
        debug: true,
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        debugOptions,
      );

      expect(consoleSpy).toHaveBeenCalledWith('[@sentry/nextjs] Running runAfterProductionCompile logic.');

      consoleSpy.mockRestore();
    });
  });

  describe('webpack builds', () => {
    it('executes all build steps for webpack builds', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'webpack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.createRelease).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith(['/path/to/.next'], {
        prepareArtifacts: false,
      });
      expect(mockSentryBuildPluginManager.deleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('logs debug message for webpack builds when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const debugOptions = {
        ...mockSentryBuildOptions,
        debug: true,
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'webpack',
        },
        debugOptions,
      );

      expect(consoleSpy).toHaveBeenCalledWith('[@sentry/nextjs] Running runAfterProductionCompile logic.');

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('handles missing bundler plugin core gracefully', async () => {
      (loadModule as any).mockReturnValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
      );
      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('handles missing createSentryBuildPluginManager export gracefully', async () => {
      (loadModule as any).mockReturnValue({});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
      );
      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('propagates errors from build plugin manager operations', async () => {
      const mockError = new Error('Test error');
      mockSentryBuildPluginManager.createRelease.mockRejectedValue(mockError);

      await expect(
        handleRunAfterProductionCompile(
          {
            releaseName: 'test-release',
            distDir: '/path/to/.next',
            buildTool: 'turbopack',
          },
          mockSentryBuildOptions,
        ),
      ).rejects.toThrow('Test error');
    });
  });

  describe('step execution order', () => {
    it('executes build steps in correct order', async () => {
      const executionOrder: string[] = [];

      mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal.mockImplementation(async () => {
        executionOrder.push('telemetry');
      });
      mockSentryBuildPluginManager.createRelease.mockImplementation(async () => {
        executionOrder.push('createRelease');
      });
      mockSentryBuildPluginManager.injectDebugIds.mockImplementation(async () => {
        executionOrder.push('injectDebugIds');
      });
      mockSentryBuildPluginManager.uploadSourcemaps.mockImplementation(async () => {
        executionOrder.push('uploadSourcemaps');
      });
      mockSentryBuildPluginManager.deleteArtifacts.mockImplementation(async () => {
        executionOrder.push('deleteArtifacts');
      });

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(executionOrder).toEqual([
        'telemetry',
        'createRelease',
        'injectDebugIds',
        'uploadSourcemaps',
        'deleteArtifacts',
      ]);
    });
  });

  describe('sourcemaps disabled', () => {
    it('skips debug ID injection when sourcemaps.disable is true', async () => {
      const optionsWithDisabledSourcemaps: SentryBuildOptions = {
        ...mockSentryBuildOptions,
        sourcemaps: {
          disable: true,
        },
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        optionsWithDisabledSourcemaps,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).not.toHaveBeenCalled();
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalled();
    });

    it('still injects debug IDs when sourcemaps.disable is false', async () => {
      const optionsWithEnabledSourcemaps: SentryBuildOptions = {
        ...mockSentryBuildOptions,
        sourcemaps: {
          disable: false,
        },
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        optionsWithEnabledSourcemaps,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
    });

    it('still injects debug IDs when sourcemaps option is undefined', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
    });
  });

  describe('sourceMappingURL stripping', () => {
    let readdirSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Spy on fs.promises.readdir to detect whether stripping was attempted.
      // The actual readdir will fail (dir doesn't exist), which is fine — we just
      // need to know if it was called.
      readdirSpy = vi.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('ENOENT'));
    });

    afterEach(() => {
      readdirSpy.mockRestore();
    });

    it('strips sourceMappingURL comments for turbopack builds with deleteSourcemapsAfterUpload', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        {
          ...mockSentryBuildOptions,
          sourcemaps: { deleteSourcemapsAfterUpload: true },
        },
      );

      expect(readdirSpy).toHaveBeenCalledWith(
        path.join('/path/to/.next', 'static'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('does NOT strip sourceMappingURL comments for webpack builds even with deleteSourcemapsAfterUpload', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'webpack',
        },
        {
          ...mockSentryBuildOptions,
          sourcemaps: { deleteSourcemapsAfterUpload: true },
        },
      );

      expect(readdirSpy).not.toHaveBeenCalled();
    });

    it('does NOT strip sourceMappingURL comments when deleteSourcemapsAfterUpload is false', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        {
          ...mockSentryBuildOptions,
          sourcemaps: { deleteSourcemapsAfterUpload: false },
        },
      );

      expect(readdirSpy).not.toHaveBeenCalled();
    });

    it('does NOT strip sourceMappingURL comments when deleteSourcemapsAfterUpload is undefined', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(readdirSpy).not.toHaveBeenCalled();
    });

    it('does NOT strip sourceMappingURL comments when SRI is enabled', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
          sriEnabled: true,
        },
        {
          ...mockSentryBuildOptions,
          sourcemaps: { deleteSourcemapsAfterUpload: true },
        },
      );

      expect(readdirSpy).not.toHaveBeenCalled();
    });

    it('strips sourceMappingURL comments when SRI is not enabled', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
          sriEnabled: false,
        },
        {
          ...mockSentryBuildOptions,
          sourcemaps: { deleteSourcemapsAfterUpload: true },
        },
      );

      expect(readdirSpy).toHaveBeenCalledWith(
        path.join('/path/to/.next', 'static'),
        expect.objectContaining({ recursive: true }),
      );
    });
  });

  describe('path handling', () => {
    it('correctly passes distDir to debug ID injection', async () => {
      const customDistDir = '/custom/dist/path';

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: customDistDir,
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith([customDistDir]);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith([customDistDir], {
        prepareArtifacts: false,
      });
    });

    it('works with relative paths', async () => {
      const relativeDistDir = '.next';

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: relativeDistDir,
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith([relativeDistDir]);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith([relativeDistDir], {
        prepareArtifacts: false,
      });
    });
  });
});

describe('stripSourceMappingURLComments', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sentry-test-'));
    await fs.promises.mkdir(path.join(tmpDir, 'chunks'), { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('strips sourceMappingURL comment from JS files', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'abc123.js');
    await fs.promises.writeFile(filePath, 'console.log("hello");\n//# sourceMappingURL=abc123.js.map');

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('console.log("hello");');
    expect(content).not.toContain('sourceMappingURL');
  });

  it('strips sourceMappingURL comment from MJS files', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'module.mjs');
    await fs.promises.writeFile(filePath, 'export default 42;\n//# sourceMappingURL=module.mjs.map');

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('export default 42;');
  });

  it('strips sourceMappingURL comment from CSS files', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'styles.css');
    await fs.promises.writeFile(filePath, '.foo { color: red; }\n/*# sourceMappingURL=styles.css.map */');

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('.foo { color: red; }');
  });

  it('does not modify files without sourceMappingURL comments', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'clean.js');
    const originalContent = 'console.log("no source map ref");';
    await fs.promises.writeFile(filePath, originalContent);

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe(originalContent);
  });

  it('handles files in nested subdirectories', async () => {
    const nestedDir = path.join(tmpDir, 'chunks', 'app', 'page');
    await fs.promises.mkdir(nestedDir, { recursive: true });
    const filePath = path.join(nestedDir, 'layout.js');
    await fs.promises.writeFile(filePath, 'var x = 1;\n//# sourceMappingURL=layout.js.map');

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('var x = 1;');
  });

  it('handles non-existent directory gracefully', async () => {
    await expect(stripSourceMappingURLComments('/nonexistent/path')).resolves.toBeUndefined();
  });

  it('handles sourceMappingURL with @-style comment', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'legacy.js');
    await fs.promises.writeFile(filePath, 'var y = 2;\n//@ sourceMappingURL=legacy.js.map');

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('var y = 2;');
  });

  it('ignores non-JS/CSS files', async () => {
    const filePath = path.join(tmpDir, 'chunks', 'data.json');
    const originalContent = '{"key": "value"}\n//# sourceMappingURL=data.json.map';
    await fs.promises.writeFile(filePath, originalContent);

    await stripSourceMappingURLComments(tmpDir);

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe(originalContent);
  });

  it('processes multiple files concurrently', async () => {
    const files = ['a.js', 'b.mjs', 'c.cjs', 'd.css'];
    for (const file of files) {
      const ext = path.extname(file);
      const comment = ext === '.css' ? `/*# sourceMappingURL=${file}.map */` : `//# sourceMappingURL=${file}.map`;
      await fs.promises.writeFile(path.join(tmpDir, file), `content_${file}\n${comment}`);
    }

    await stripSourceMappingURLComments(tmpDir);

    for (const file of files) {
      const content = await fs.promises.readFile(path.join(tmpDir, file), 'utf-8');
      expect(content).toBe(`content_${file}`);
      expect(content).not.toContain('sourceMappingURL');
    }
  });
});
