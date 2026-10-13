import type { Integration } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockApplySdkMetadata = vi.fn();
const mockInitNode = vi.fn();
const mockGetBunDefaultIntegrations = vi.fn(() => [] as Integration[]);
const mockMakeFetchTransport = vi.fn();

vi.mock('@sentry/core', async importActual => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importActual<typeof import('@sentry/core')>();
  return {
    ...actual,
    applySdkMetadata: mockApplySdkMetadata,
  };
});

vi.mock('@sentry/bun', () => ({
  init: mockInitNode,
  getDefaultIntegrations: mockGetBunDefaultIntegrations,
  makeFetchTransport: mockMakeFetchTransport,
  bunServerIntegration: () => ({ name: 'BunServer', setupOnce: vi.fn() }),
}));

// Must import after mocks are set up
// @ts-expect-error - dynamic import
const { init, getDefaultIntegrations } = await import('../src/sdk');

describe('init', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('sets SDK metadata to elysia', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockApplySdkMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' }),
      'elysia',
      ['elysia', 'node'],
    );
  });

  it('calls initNode with the options', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        platform: 'javascript',
      }),
    );
  });

  it('uses makeFetchTransport by default', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: mockMakeFetchTransport,
      }),
    );
  });

  it('allows overriding transport', () => {
    const customTransport = vi.fn();
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0', transport: customTransport });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: customTransport,
      }),
    );
  });

  it('sets default integrations from bun and filters out BunServer', () => {
    const mockIntegration = { name: 'MockIntegration', setupOnce: vi.fn() };
    const bunServerMock = { name: 'BunServer', setupOnce: vi.fn() };
    mockGetBunDefaultIntegrations.mockReturnValueOnce([mockIntegration, bunServerMock]);

    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: [mockIntegration],
      }),
    );
  });

  it('does not override user-provided defaultIntegrations', () => {
    const userIntegrations = [{ name: 'UserIntegration', setupOnce: vi.fn() }];

    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0', defaultIntegrations: userIntegrations });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: userIntegrations,
      }),
    );
    expect(mockGetBunDefaultIntegrations).not.toHaveBeenCalled();
  });

  it('detects runtime correctly', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    const calledOptions = mockInitNode.mock.calls[0]![0];
    // In vitest (Node), Bun is not defined, so runtime should be node
    expect(calledOptions.runtime.name).toBe('node');
    expect(calledOptions.runtime.version).toBe(process.version);
  });

  it('detects bun runtime when Bun is defined', () => {
    vi.stubGlobal('Bun', { version: '1.2.3' });

    init({ dsn: 'https://***@o0.ingest.sentry.io/0' });

    const calledOptions = mockInitNode.mock.calls[0]![0];
    expect(calledOptions.runtime).toEqual({ name: 'bun', version: '1.2.3' });
    expect(mockApplySdkMetadata).toHaveBeenCalledWith(expect.anything(), 'elysia', ['elysia', 'bun']);
  });
});

describe('getDefaultIntegrations', () => {
  it('returns bun default integrations without BunServer', () => {
    const mockIntegration = { name: 'MockIntegration', setupOnce: vi.fn() };
    const bunServerMock = { name: 'BunServer', setupOnce: vi.fn() };
    mockGetBunDefaultIntegrations.mockReturnValueOnce([mockIntegration, bunServerMock]);

    const integrations = getDefaultIntegrations({});

    expect(integrations).toEqual([mockIntegration]);
    expect(mockGetBunDefaultIntegrations).toHaveBeenCalledWith({});
  });
});
