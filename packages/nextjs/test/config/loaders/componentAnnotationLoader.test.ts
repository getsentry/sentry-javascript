import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentAnnotationLoaderOptions } from '../../../src/config/loaders/componentAnnotationLoader';
import componentAnnotationLoader from '../../../src/config/loaders/componentAnnotationLoader';
import type { LoaderThis } from '../../../src/config/loaders/types';

const { mockTransform, mockCreateHooks } = vi.hoisted(() => {
  const mockTransform = vi.fn();
  const mockCreateHooks = vi.fn().mockReturnValue({ transform: mockTransform });
  return { mockTransform, mockCreateHooks };
});

vi.mock('@sentry/bundler-plugin-core', () => ({
  createComponentNameAnnotateHooks: mockCreateHooks,
}));

function createMockLoaderContext(
  options: ComponentAnnotationLoaderOptions = {},
  resourcePath = '/app/components/Button.tsx',
): LoaderThis<ComponentAnnotationLoaderOptions> & { callback: ReturnType<typeof vi.fn> } {
  const callback = vi.fn();
  return {
    resourcePath,
    addDependency: vi.fn(),
    cacheable: vi.fn(),
    async: vi.fn().mockReturnValue(callback),
    callback,
    getOptions: vi.fn().mockReturnValue(options),
  };
}

describe('componentAnnotationLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransform.mockReset();
    mockCreateHooks.mockReturnValue({ transform: mockTransform });
  });

  it('calls this.async() and uses callback with transformed code and source map', async () => {
    const mockResult = {
      code: 'transformed code',
      map: { version: 3, sources: ['Button.tsx'] },
    };
    mockTransform.mockResolvedValue(mockResult);

    const ctx = createMockLoaderContext();
    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ctx.async).toHaveBeenCalled();
    expect(ctx.callback).toHaveBeenCalledWith(null, 'transformed code', { version: 3, sources: ['Button.tsx'] });
  });

  it('passes through original code when transform returns null', async () => {
    mockTransform.mockResolvedValue(null);

    const ctx = createMockLoaderContext();
    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ctx.callback).toHaveBeenCalledWith(null, 'original code');
  });

  it('passes through original code on transform error', async () => {
    mockTransform.mockRejectedValue(new Error('babel error'));

    const ctx = createMockLoaderContext();
    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ctx.callback).toHaveBeenCalledWith(null, 'original code');
  });

  it('sets cacheable(false)', () => {
    mockTransform.mockResolvedValue(null);

    const ctx = createMockLoaderContext();
    componentAnnotationLoader.call(ctx, 'original code');

    expect(ctx.cacheable).toHaveBeenCalledWith(false);
  });

  it('reads options via getOptions() (webpack 5)', async () => {
    mockTransform.mockResolvedValue(null);

    const ctx = createMockLoaderContext({ ignoredComponents: ['Header'] });
    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockCreateHooks).toHaveBeenCalledWith(['Header'], false);
  });

  it('reads options via this.query (webpack 4)', async () => {
    mockTransform.mockResolvedValue(null);

    const callback = vi.fn();
    const ctx = {
      resourcePath: '/app/components/Button.tsx',
      addDependency: vi.fn(),
      cacheable: vi.fn(),
      async: vi.fn().mockReturnValue(callback),
      callback,
      query: { ignoredComponents: ['Footer'] },
    } as unknown as LoaderThis<ComponentAnnotationLoaderOptions>;

    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockCreateHooks).toHaveBeenCalledWith(['Footer'], false);
  });

  it('defaults ignoredComponents to empty array', async () => {
    mockTransform.mockResolvedValue(null);

    const ctx = createMockLoaderContext({});
    componentAnnotationLoader.call(ctx, 'original code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockCreateHooks).toHaveBeenCalledWith([], false);
  });

  it('passes resourcePath to transform', async () => {
    mockTransform.mockResolvedValue(null);

    const ctx = createMockLoaderContext({}, '/app/pages/Home.tsx');
    componentAnnotationLoader.call(ctx, 'some code');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockTransform).toHaveBeenCalledWith('some code', '/app/pages/Home.tsx');
  });
});
