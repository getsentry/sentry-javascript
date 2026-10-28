import type { Integration } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockInitNode = vi.fn();
const mockGetBunDefaultIntegrations = vi.fn(() => [] as Integration[]);
const mockMakeFetchTransport = vi.fn();
const mockMakeNodeTransport = vi.fn();

vi.mock('@sentry/bun', () => ({
  init: mockInitNode,
  getDefaultIntegrations: mockGetBunDefaultIntegrations,
  makeFetchTransport: mockMakeFetchTransport,
  makeNodeTransport: mockMakeNodeTransport,
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

  it('passes Elysia SDK metadata to initNode', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: expect.objectContaining({
            name: 'sentry.javascript.elysia',
            packages: [
              expect.objectContaining({ name: 'npm:@sentry/elysia' }),
              expect.objectContaining({ name: 'npm:@sentry/node' }),
            ],
          }),
        },
      }),
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

  it('uses makeNodeTransport by default on Node', () => {
    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: mockMakeNodeTransport,
      }),
    );
  });

  it('uses makeFetchTransport by default on Bun', () => {
    vi.stubGlobal('Bun', { version: '1.2.3' });

    init({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(expect.objectContaining({ transport: mockMakeFetchTransport }));
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

    // In vitest (Node), Bun is not defined, so runtime should be node
    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: { name: 'node', version: process.version },
      }),
    );
  });

  it('detects bun runtime when Bun is defined', () => {
    vi.stubGlobal('Bun', { version: '1.2.3' });

    init({ dsn: 'https://***@o0.ingest.sentry.io/0' });

    expect(mockInitNode).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: { name: 'bun', version: '1.2.3' },
        _metadata: {
          sdk: expect.objectContaining({
            name: 'sentry.javascript.elysia',
            packages: [
              expect.objectContaining({ name: 'npm:@sentry/elysia' }),
              expect.objectContaining({ name: 'npm:@sentry/bun' }),
            ],
          }),
        },
      }),
    );
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
