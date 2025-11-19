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

  describe('proxy environment variables and layer extension', () => {
    test('should enable useLayerExtension when no proxy env vars are set', () => {
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

    test('should disable useLayerExtension when http_proxy is set', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
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

    describe('no_proxy patterns', () => {
      test('should enable useLayerExtension when no_proxy=* (wildcard)', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = '*';
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

      test('should enable useLayerExtension when no_proxy contains localhost', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = 'localhost';
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

      test('should enable useLayerExtension when no_proxy contains 127.0.0.1', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = '127.0.0.1';
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

      test('should enable useLayerExtension when no_proxy contains ::1', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = '::1';
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

      test('should enable useLayerExtension when no_proxy contains localhost in a comma-separated list', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = 'example.com,localhost,other.com';
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

      test('should disable useLayerExtension when no_proxy does not contain localhost patterns', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = 'example.com,other.com';
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

      test('should disable useLayerExtension when no_proxy contains host (no longer supported)', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = 'host';
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

      test('should handle case-insensitive no_proxy values', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = 'LOCALHOST';
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

      test('should handle whitespace in no_proxy values', () => {
        process.env.http_proxy = 'http://proxy.example.com:8080';
        process.env.no_proxy = ' localhost , example.com ';
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
    });

    test('should respect explicit useLayerExtension=false even with no proxy interference', () => {
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

    test('should respect explicit useLayerExtension=false even with proxy that would interfere', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
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

    test('should respect explicit useLayerExtension=false even when no_proxy would enable it', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
      process.env.no_proxy = 'localhost';
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

    test('should not set tunnel even tho useLayerExtension is set via env var when proxy is explicitly set', () => {
      process.env.http_proxy = 'http://proxy.example.com:8080';
      process.env.SENTRY_LAYER_EXTENSION = 'true';
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      // useLayerExtension is respected but tunnel is not set due to proxy interference
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          useLayerExtension: true,
        }),
      );
      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });
  });
});
