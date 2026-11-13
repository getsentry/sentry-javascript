import { getSDKSource } from '@sentry/core';
import { initWithoutDefaultIntegrations } from '@sentry/node';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AwsServerlessOptions } from '../src/init';
import { init } from '../src/init';

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal()),
  getSDKSource: vi.fn(),
}));

vi.mock('@sentry/node', async importOriginal => ({
  ...(await importOriginal()),
  initWithoutDefaultIntegrations: vi.fn(),
}));

const mockGetSDKSource = vi.mocked(getSDKSource);
const mockInitWithoutDefaultIntegrations = vi.mocked(initWithoutDefaultIntegrations);

describe('init', () => {
  beforeEach(() => {
    // Clear all mocks between tests
    vi.clearAllMocks();

    // Clean up environment variables between tests
    delete process.env.http_proxy;
    delete process.env.no_proxy;
    delete process.env.SENTRY_LAYER_EXTENSION;
  });

  describe('Lambda extension setup', () => {
    test('should preserve user-provided tunnel option when Lambda extension is enabled', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        tunnel: 'https://custom-tunnel.example.com',
        useLayerExtension: true,
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          tunnel: 'https://custom-tunnel.example.com',
        }),
      );
    });

    test('should set default tunnel when Lambda extension is enabled and SDK source is aws-lambda-layer', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        useLayerExtension: true,
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          tunnel: 'http://localhost:9000/envelope',
        }),
      );
    });

    test('should not set tunnel when Lambda extension is disabled', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        useLayerExtension: false,
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should not set tunnel when SDK source is not aws-lambda-layer even with Lambda extension enabled', () => {
      mockGetSDKSource.mockReturnValue('npm');
      const options: AwsServerlessOptions = {
        useLayerExtension: true,
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should default useLayerExtension to true when SDK source is aws-lambda-layer', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
          tunnel: 'http://localhost:9000/envelope',
        }),
      );
    });

    test('should default useLayerExtension to false when SDK source is not aws-lambda-layer', () => {
      mockGetSDKSource.mockReturnValue('npm');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: false,
        }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should default useLayerExtension to false when tunnel is provided even when SDK source is aws-lambda-layer', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        tunnel: 'https://custom-tunnel.example.com',
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: false,
          tunnel: 'https://custom-tunnel.example.com',
        }),
      );
    });
  });

  describe('proxy settings and layer extension', () => {
    test('keeps the extension enabled and bypasses the proxy for it when http_proxy is set', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');

      init({ transportOptions: { keepAlive: false } });

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
          tunnel: 'http://localhost:9000/envelope',
          transportOptions: { keepAlive: false, proxy: false },
        }),
      );
    });

    test.each([
      ['proxy', { proxy: 'http://proxy.example.com:8080' }],
      ['caCerts', { caCerts: 'cert' }],
    ])('disables the extension when transportOptions.%s is set', (_name, transportOptions) => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');

      init({ transportOptions });

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({ useLayerExtension: false, transportOptions }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({ tunnel: expect.any(String) }),
      );
    });

    test('does not use the extension when explicitly enabled but transportOptions sets a proxy', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const transportOptions = { proxy: 'http://proxy.example.com:8080' };

      init({ useLayerExtension: true, transportOptions });

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({ useLayerExtension: true, transportOptions }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({ tunnel: expect.any(String) }),
      );
    });

    test('respects explicit useLayerExtension=false when http_proxy is set', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');

      init({ useLayerExtension: false });

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({ useLayerExtension: false }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({ tunnel: expect.any(String) }),
      );
    });
  });

  describe('SENTRY_LAYER_EXTENSION environment variable', () => {
    test('should enable useLayerExtension when SENTRY_LAYER_EXTENSION=true', () => {
      process.env.SENTRY_LAYER_EXTENSION = 'true';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
          tunnel: 'http://localhost:9000/envelope',
        }),
      );
    });

    test('should disable useLayerExtension when SENTRY_LAYER_EXTENSION=false', () => {
      process.env.SENTRY_LAYER_EXTENSION = 'false';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: false,
        }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should fall back to default behavior when SENTRY_LAYER_EXTENSION is not set', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
          tunnel: 'http://localhost:9000/envelope',
        }),
      );
    });

    test('should prioritize explicit option over environment variable', () => {
      process.env.SENTRY_LAYER_EXTENSION = 'true';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        useLayerExtension: false,
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: false,
        }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should set tunnel when useLayerExtension is set via env var and http_proxy is set', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
      process.env.SENTRY_LAYER_EXTENSION = 'true';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');

      init({});

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
          tunnel: 'http://localhost:9000/envelope',
          transportOptions: { proxy: false },
        }),
      );
    });
  });
});
