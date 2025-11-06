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

  let mockWorker2: {
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

    mockWorker2 = {
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

  it('creates integration with correct name', () => {
    const integration = webWorkerIntegration({ worker: mockWorker as any });

    expect(integration.name).toBe(INTEGRATION_NAME);
    expect(integration.name).toBe('WebWorker');
    expect(typeof integration.setupOnce).toBe('function');
  });

  describe('setupOnce', () => {
    it('adds message event listener to the worker', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      integration.setupOnce!();

      expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('adds message event listener to multiple workers passed to the integration', () => {
      const integration = webWorkerIntegration({ worker: [mockWorker, mockWorker2] as any });
      integration.setupOnce!();
      expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('adds message event listener to a worker added later', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });
      integration.setupOnce!();
      integration.addWorker(mockWorker2 as any);
      expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    describe('message handler', () => {
      let messageHandler: (event: any) => void;

      beforeEach(() => {
        const integration = webWorkerIntegration({ worker: mockWorker as any });
        integration.setupOnce!();

        // Extract the message handler from the addEventListener call
        expect(mockWorker.addEventListener.mock.calls).toBeDefined();
        messageHandler = mockWorker.addEventListener.mock.calls[0]![1];
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

      it('processes valid Sentry messages', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: { 'file1.js': 'debug-id-1' },
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
    addEventListener: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkerSelf = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
  });

  it('posts message with _sentryMessage flag', () => {
    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
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

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
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

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
    });
  });
});

describe('registerWebWorker and webWorkerIntegration', () => {
  beforeEach(() => {});

  it('work together (with multiple workers)', () => {
    (helpers.WINDOW as any)._sentryDebugIds = {
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
    };

    let cb1: ((arg0: any) => any) | undefined = undefined;
    let cb2: ((arg0: any) => any) | undefined = undefined;
    let cb3: ((arg0: any) => any) | undefined = undefined;

    // Setup mock worker
    const mockWorker = {
      _sentryDebugIds: {
        'Error at \n /worker-file1.js': 'worker-debug-1',
        'Error at \n /worker-file2.js': 'worker-debug-2',
        'Error at \n /shared-file.js': 'worker-debug-id',
      },
      addEventListener: vi.fn((_, l) => (cb1 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb1({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const mockWorker2 = {
      _sentryDebugIds: {
        'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
        'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
      },

      addEventListener: vi.fn((_, l) => (cb2 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb2({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const mockWorker3 = {
      _sentryDebugIds: {
        'Error at \n /worker-3-file1.js': 'worker-3-debug-1',
        'Error at \n /worker-3-file2.js': 'worker-3-debug-2',
      },
      addEventListener: vi.fn((_, l) => (cb3 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb3({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const integration = webWorkerIntegration({ worker: [mockWorker as any, mockWorker2 as any] });
    integration.setupOnce!();

    registerWebWorker({ self: mockWorker as any });
    registerWebWorker({ self: mockWorker2 as any });

    expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: mockWorker._sentryDebugIds,
    });

    expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
      'Error at \n /worker-file1.js': 'worker-debug-1',
      'Error at \n /worker-file2.js': 'worker-debug-2',
      'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
      'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
    });

    integration.addWorker(mockWorker3 as any);
    registerWebWorker({ self: mockWorker3 as any });

    expect(mockWorker3.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    expect(mockWorker3.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: mockWorker3._sentryDebugIds,
    });

    expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
      'Error at \n /worker-file1.js': 'worker-debug-1',
      'Error at \n /worker-file2.js': 'worker-debug-2',
      'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
      'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
      'Error at \n /worker-3-file1.js': 'worker-3-debug-1',
      'Error at \n /worker-3-file2.js': 'worker-3-debug-2',
    });
  });
});
