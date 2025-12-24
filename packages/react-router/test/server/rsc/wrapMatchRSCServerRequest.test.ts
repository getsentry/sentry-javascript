import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchRSCServerRequestArgs, MatchRSCServerRequestFn, RSCMatch } from '../../../src/server/rsc/types';
import { wrapMatchRSCServerRequest } from '../../../src/server/rsc/wrapMatchRSCServerRequest';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    captureException: vi.fn(),
    getIsolationScope: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
  };
});

describe('wrapMatchRSCServerRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockArgs = (): MatchRSCServerRequestArgs => ({
    request: new Request('http://test.com/users/123'),
    routes: [{ path: '/users/:id' }],
    createTemporaryReferenceSet: () => ({}),
    generateResponse: vi.fn().mockReturnValue(new Response('test')),
  });

  it('should wrap the original function and call it with modified args', async () => {
    const mockResponse = new Response('rsc payload');
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockResolvedValue(mockResponse);
    const mockArgs = createMockArgs();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    const result = await wrappedFn(mockArgs);

    expect(result).toBe(mockResponse);
    expect(mockOriginalFn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: mockArgs.request,
        routes: mockArgs.routes,
      }),
    );
    expect(mockSetTransactionName).toHaveBeenCalledWith('RSC GET /users/123');
  });

  it('should update root span attributes if active span exists', async () => {
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockResolvedValue(new Response('test'));
    const mockArgs = createMockArgs();
    const mockSetTransactionName = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };
    const mockActiveSpan = {};

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.getActiveSpan as any).mockReturnValue(mockActiveSpan);
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    expect(core.getRootSpan).toHaveBeenCalledWith(mockActiveSpan);
    expect(mockSetAttributes).toHaveBeenCalledWith({
      [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc',
      'rsc.request': true,
    });
  });

  it('should wrap generateResponse with a span and error capture', async () => {
    const mockMatch: RSCMatch = {
      payload: { data: 'test' },
      statusCode: 200,
      headers: new Headers(),
    };
    const mockGenerateResponse = vi.fn().mockReturnValue(new Response('generated'));
    const mockArgs: MatchRSCServerRequestArgs = {
      ...createMockArgs(),
      generateResponse: mockGenerateResponse,
    };

    let capturedGenerateResponse: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedGenerateResponse = args.generateResponse;
      return new Response('test');
    });

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((options: any, fn: any) => {
      return fn({ setStatus: vi.fn() });
    });

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped generateResponse
    capturedGenerateResponse(mockMatch, { temporaryReferences: {} });

    expect(mockGenerateResponse).toHaveBeenCalledWith(mockMatch, expect.objectContaining({ temporaryReferences: {} }));
    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSC Render',
        attributes: expect.objectContaining({
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.render',
          'rsc.status_code': 200,
        }),
      }),
      expect.any(Function),
    );
  });

  it('should capture errors from generateResponse and set span status', async () => {
    const testError = new Error('generateResponse failed');
    const mockGenerateResponse = vi.fn().mockImplementation(() => {
      throw testError;
    });
    const mockMatch: RSCMatch = {
      payload: { data: 'test' },
      statusCode: 200,
      headers: new Headers(),
    };
    const mockArgs: MatchRSCServerRequestArgs = {
      ...createMockArgs(),
      generateResponse: mockGenerateResponse,
    };

    let capturedGenerateResponse: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedGenerateResponse = args.generateResponse;
      return new Response('test');
    });

    const mockSetStatus = vi.fn();
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped generateResponse and expect it to throw
    expect(() => capturedGenerateResponse(mockMatch, { temporaryReferences: {} })).toThrow('generateResponse failed');

    // Span status should be set to error
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });

    // Error is captured in generateResponse catch block with error tracking to prevent double-capture
    expect(core.captureException).toHaveBeenCalledWith(testError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'generateResponse',
        },
      },
    });
  });

  it('should wrap loadServerAction with a span', async () => {
    const mockServerAction = vi.fn();
    const mockLoadServerAction = vi.fn().mockResolvedValue(mockServerAction);
    const mockArgs: MatchRSCServerRequestArgs = {
      ...createMockArgs(),
      loadServerAction: mockLoadServerAction,
    };

    let capturedLoadServerAction: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedLoadServerAction = args.loadServerAction;
      return new Response('test');
    });

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped loadServerAction
    const result = await capturedLoadServerAction('my-action-id');

    expect(result).toBe(mockServerAction);
    expect(mockLoadServerAction).toHaveBeenCalledWith('my-action-id');
    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Server Action: my-action-id',
        attributes: expect.objectContaining({
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.server_action',
          'rsc.action.id': 'my-action-id',
        }),
      }),
      expect.any(Function),
    );
  });

  it('should capture errors from loadServerAction with action_id', async () => {
    const mockError = new Error('loadServerAction failed');
    const mockLoadServerAction = vi.fn().mockRejectedValue(mockError);
    const mockArgs: MatchRSCServerRequestArgs = {
      ...createMockArgs(),
      loadServerAction: mockLoadServerAction,
    };

    let capturedLoadServerAction: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedLoadServerAction = args.loadServerAction;
      return new Response('test');
    });

    const mockSetStatus = vi.fn();
    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the wrapped loadServerAction and expect it to reject
    await expect(capturedLoadServerAction('action-id')).rejects.toThrow('loadServerAction failed');

    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'loadServerAction',
          action_id: 'action-id',
        },
      },
    });
  });

  it('should enhance onError callback', async () => {
    const originalOnError = vi.fn();
    const mockArgs: MatchRSCServerRequestArgs = {
      ...createMockArgs(),
      onError: originalOnError,
    };

    let capturedOnError: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedOnError = args.onError;
      return new Response('test');
    });

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // Call the enhanced onError
    const testError = new Error('test error');
    capturedOnError(testError);

    expect(originalOnError).toHaveBeenCalledWith(testError);
    expect(core.captureException).toHaveBeenCalledWith(testError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'matchRSCServerRequest.onError',
        },
      },
    });
  });

  it('should create onError handler even if not provided in args', async () => {
    const mockArgs = createMockArgs();
    // Ensure no onError is provided
    delete (mockArgs as any).onError;

    let capturedOnError: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedOnError = args.onError;
      return new Response('test');
    });

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    // onError should be created by the wrapper
    expect(capturedOnError).toBeDefined();

    // Calling it should capture the exception
    const testError = new Error('test error');
    capturedOnError(testError);
    expect(core.captureException).toHaveBeenCalledWith(testError, expect.any(Object));
  });

  it('should not create loadServerAction wrapper if not provided', async () => {
    const mockArgs = createMockArgs();
    delete (mockArgs as any).loadServerAction;

    let capturedArgs: any;
    const mockOriginalFn: MatchRSCServerRequestFn = vi.fn().mockImplementation(async args => {
      capturedArgs = args;
      return new Response('test');
    });

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: vi.fn() });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapMatchRSCServerRequest(mockOriginalFn);
    await wrappedFn(mockArgs);

    expect(capturedArgs.loadServerAction).toBeUndefined();
  });
});
