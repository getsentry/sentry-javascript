import { getSDKSource } from '@sentry/core';
import { initWithoutDefaultIntegrations } from '@sentry/node';
import { describe, expect, test, vi } from 'vitest';
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
  describe('experimental Lambda extension support', () => {
    test('should preserve user-provided tunnel option when Lambda extension is enabled', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {
        tunnel: 'https://custom-tunnel.example.com',
        _experiments: {
          enableLambdaExtension: true,
        },
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
        _experiments: {
          enableLambdaExtension: true,
        },
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
        _experiments: {
          enableLambdaExtension: false,
        },
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
        _experiments: {
          enableLambdaExtension: true,
        },
      };

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });

    test('should not set tunnel when no experiments are provided', () => {
      mockGetSDKSource.mockReturnValue('aws-lambda-layer');
      const options: AwsServerlessOptions = {};

      init(options);

      expect(mockInitWithoutDefaultIntegrations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tunnel: expect.any(String),
        }),
      );
    });
  });
});
