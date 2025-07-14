/**
 * @vitest-environment jsdom
 */

import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as helpers from '../../src/helpers';
import { INTEGRATION_NAME, registerWebWorker, webWorkerIntegration } from '../../src/integrations/webWorker';

// Mock @sentry/core
vi.mock('@sentry/core', async importActual => {
  return {
    ...((await importActual()) as any),
    debug: {
      log: vi.fn(),
    },
  };
});

// Mock debug build
vi.mock('../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));

// Mock helpers
vi.mock('../../src/helpers', () => ({
  WINDOW: {
    _sentryDebugIds: undefined,
  },
}));

describe('webWorkerIntegration', () => {
  const mockDebugLog = SentryCore.debug.log as any;

  let mockWorker: {
    addEventListener: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
  };

  let mockEvent: {
    data: any;
    stopImmediatePropagation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset WINDOW mock
    (helpers.WINDOW as any)._sentryDebugIds = undefined;

    // Setup mock worker
    mockWorker = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
    };

    // Setup mock event
    mockEvent = {
      data: {},
      stopImmediatePropagation: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('integration creation', () => {
    it('creates integration with correct name', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      expect(integration.name).toBe(INTEGRATION_NAME);
      expect(integration.name).toBe('WebWorker');
    });

    it('returns a properly structured integration object', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      expect(typeof integration).toBe('object');
      expect(integration.name).toBeDefined();
      expect(integration.setupOnce).toBeDefined();
    });

    it('returns integration object with setupOnce function', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      expect(integration).toMatchObject({
        name: 'WebWorker',
        setupOnce: expect.any(Function),
      });
    });
  });

  describe('setupOnce', () => {
    it('adds message event listener to worker', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      expect(integration.setupOnce).toBeDefined();
      integration.setupOnce!();

      expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    describe('message handler', () => {
      let messageHandler: (event: any) => void;

      beforeEach(() => {
        const integration = webWorkerIntegration({ worker: mockWorker as any });
        expect(integration.setupOnce).toBeDefined();
        integration.setupOnce!();

        // Extract the message handler from the addEventListener call
        expect(mockWorker.addEventListener.mock.calls).toBeDefined();
        messageHandler = mockWorker.addEventListener.mock.calls![0]![1];
      });

      it('ignores non-Sentry messages', () => {
        mockEvent.data = { someData: 'value' };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(mockDebugLog).not.toHaveBeenCalled();
      });

      it('ignores plain objects without _sentryMessage flag', () => {
        mockEvent.data = {
          someData: 'value',
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(mockDebugLog).not.toHaveBeenCalled();
      });

      it('ignores messages without _sentry object', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: { 'file1.js': 'debug-id-1' },
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(mockDebugLog).not.toHaveBeenCalled();
      });

      it('processes valid Sentry messages', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: { 'file1.js': 'debug-id-1' },
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect(mockDebugLog).toHaveBeenCalledWith('Sentry debugId web worker message received', mockEvent.data);
      });

      it('merges debug IDs with worker precedence for new IDs', () => {
        (helpers.WINDOW as any)._sentryDebugIds = undefined;

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {
            'worker-file1.js': 'worker-debug-1',
            'worker-file2.js': 'worker-debug-2',
          },
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'worker-file1.js': 'worker-debug-1',
          'worker-file2.js': 'worker-debug-2',
        });
      });

      it('gives main thread precedence over worker for conflicting debug IDs', () => {
        (helpers.WINDOW as any)._sentryDebugIds = {
          'shared-file.js': 'main-debug-id',
          'main-only.js': 'main-debug-2',
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {
            'shared-file.js': 'worker-debug-id', // Should be overridden
            'worker-only.js': 'worker-debug-3', // Should be kept
          },
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'shared-file.js': 'main-debug-id', // Main thread wins
          'main-only.js': 'main-debug-2', // Main thread preserved
          'worker-only.js': 'worker-debug-3', // Worker added
        });
      });

      it('handles empty debug IDs from worker', () => {
        (helpers.WINDOW as any)._sentryDebugIds = { 'main.js': 'main-debug' };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {},
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'main.js': 'main-debug',
        });
      });
    });
  });
});

describe('registerWebWorker', () => {
  let mockWorkerSelf: {
    postMessage: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkerSelf = {
      postMessage: vi.fn(),
    };
  });

  it('posts message with _sentryMessage flag', () => {
    registerWebWorker(mockWorkerSelf as any);

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
    });
  });

  it('includes debug IDs when available', () => {
    mockWorkerSelf._sentryDebugIds = {
      'worker-file1.js': 'debug-id-1',
      'worker-file2.js': 'debug-id-2',
    };

    registerWebWorker(mockWorkerSelf as any);

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: {
        'worker-file1.js': 'debug-id-1',
        'worker-file2.js': 'debug-id-2',
      },
    });
  });

  it('handles undefined debug IDs', () => {
    mockWorkerSelf._sentryDebugIds = undefined;

    registerWebWorker(mockWorkerSelf as any);

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
    });
  });

  it('handles empty debug IDs object', () => {
    mockWorkerSelf._sentryDebugIds = {};

    registerWebWorker(mockWorkerSelf as any);

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: {},
    });
  });

  it('calls postMessage exactly once', () => {
    registerWebWorker(mockWorkerSelf as any);

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('event propagation ', () => {
  // Since isWebWorkerMessage is not exported, we test it indirectly through the integration
  let messageHandler: (event: any) => void;
  let mockWorker: { addEventListener: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWorker = { addEventListener: vi.fn() };
    const integration = webWorkerIntegration({ worker: mockWorker as any });
    integration.setupOnce!();
    expect(mockWorker.addEventListener).toHaveBeenCalled();
    expect(mockWorker.addEventListener.mock.calls).toBeDefined();
    messageHandler = mockWorker.addEventListener.mock.calls![0]![1];
  });

  it.each([
    ['plain object but missing _sentryMessage: { _sentry: {} }', { _sentry: {} }],
    [
      'plain object but _sentryMessage is false: { _sentryMessage: false, _sentry: {} }',
      { _sentryMessage: false, _sentry: {} },
    ],
    ['plain object but missing _sentry: { _sentryMessage: true }', { _sentryMessage: true }],
    [
      'plain object but _sentry is not an object: { _sentryMessage: true, _sentry: "not-object" }',
      { _sentryMessage: true, _sentry: 'not-object' },
    ],
  ])("doesn't stop propagation for %s", (_desc, data) => {
    const mockEvent = { stopImmediatePropagation: vi.fn(), data };
    messageHandler(mockEvent);
    expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('stops propagation for sentry message', () => {
    const mockEvent = { stopImmediatePropagation: vi.fn(), data: { _sentryMessage: true, _sentryDebugIds: {} } };
    messageHandler(mockEvent);
    expect(mockEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });
});
