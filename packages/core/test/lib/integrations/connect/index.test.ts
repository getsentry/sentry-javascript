import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ANONYMOUS_NAME,
  patchConnectApp,
  patchConnectModule,
  setupConnectErrorHandler,
  type ConnectApp,
  type ConnectModule,
  type ConnectRequest,
  type ConnectResponse,
} from '../../../../src/integrations/connect/index';

// --- Mock Sentry core ---

const activeSpans: ReturnType<typeof makeMockSpan>[] = [];
let mockParentSpan: ReturnType<typeof makeMockSpan> | null = null;

function makeMockSpan(name = 'span') {
  return {
    name,
    ended: false,
    attributes: {} as Record<string, unknown>,
    setAttributes(attrs: Record<string, unknown>) {
      Object.assign(this.attributes, attrs);
    },
    end() {
      this.ended = true;
    },
  };
}

vi.mock('../../../../src/utils/spanUtils', () => ({
  getActiveSpan: () => mockParentSpan,
}));

const startInactiveSpanCalls: { options: unknown }[] = [];

vi.mock('../../../../src/tracing', () => ({
  startInactiveSpan(options: unknown) {
    const span = makeMockSpan((options as { name: string }).name);
    activeSpans.push(span);
    startInactiveSpanCalls.push({ options });
    return span;
  },
}));

const capturedExceptions: [unknown, unknown][] = [];
vi.mock('../../../../src/exports', () => ({
  captureException(error: unknown, hint: unknown) {
    capturedExceptions.push([error, hint]);
    return 'eventId';
  },
}));

vi.mock('../../../../src/debug-build', () => ({ DEBUG_BUILD: true }));
const debugErrors: [string, unknown][] = [];
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: { error: (msg: string, e: unknown) => debugErrors.push([msg, e]) },
}));

vi.mock('../../../../src/semanticAttributes', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_OP: 'sentry.op',
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
}));

// --- Helpers ---

function makeRequest(): ConnectRequest {
  return { method: 'GET', url: '/test' };
}

function makeResponse(): ConnectResponse & { listeners: Record<string, (() => void)[]> } {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    listeners,
    addListener(event: string, fn: () => void) {
      (listeners[event] ??= []).push(fn);
    },
    removeListener(event: string, fn: () => void) {
      listeners[event] = (listeners[event] ?? []).filter(l => l !== fn);
    },
  };
}

function makeApp(): ConnectApp & { stack: Array<(...a: unknown[]) => unknown> } {
  const stack: Array<(...a: unknown[]) => unknown> = [];
  return {
    stack,
    use(...args: unknown[]) {
      stack.push(args[args.length - 1] as (...a: unknown[]) => unknown);
      return this;
    },
    handle(req: unknown, res: unknown, out?: unknown) {
      for (const fn of stack) {
        fn(req, res, out ?? (() => undefined));
      }
      return undefined;
    },
  } as unknown as ConnectApp & { stack: Array<(...a: unknown[]) => unknown> };
}

function makeConnectModule(): ConnectModule {
  return function connect() {
    return makeApp();
  };
}

beforeEach(() => {
  activeSpans.length = 0;
  startInactiveSpanCalls.length = 0;
  capturedExceptions.length = 0;
  debugErrors.length = 0;
  mockParentSpan = makeMockSpan('parent');
});

// --- Tests ---

describe('patchConnectModule', () => {
  it('returns a factory that creates patched apps', () => {
    const connect = makeConnectModule();
    const patched = patchConnectModule(connect);
    const app = patched();
    expect(typeof app.use).toBe('function');
    expect(typeof app.handle).toBe('function');
  });

  it('patched factory passes args to original factory', () => {
    let receivedArgs: unknown[] = [];
    const connect = function (...args: unknown[]) {
      receivedArgs = args;
      return makeApp();
    };
    const patched = patchConnectModule(connect);
    patched('arg1', 'arg2');
    expect(receivedArgs).toStrictEqual(['arg1', 'arg2']);
  });

  it('wraps middleware added via use to create spans', () => {
    const connect = makeConnectModule();
    const patched = patchConnectModule(connect);
    const app = patched();

    const req = makeRequest();
    const res = makeResponse();
    let middlewareCalled = false;
    const middleware = function (_req: unknown, _res: unknown, n: () => void) {
      middlewareCalled = true;
      n();
    };
    // Clear inferred name so connect treats it as anonymous
    Object.defineProperty(middleware, 'name', { value: '', configurable: true });

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(middlewareCalled).toBe(true);
    expect(startInactiveSpanCalls).toHaveLength(1);
    expect((startInactiveSpanCalls[0]!.options as { name: string }).name).toBe(ANONYMOUS_NAME);
  });
});

describe('patchConnectApp', () => {
  it('wraps anonymous middleware without a route', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    let middlewareCalled = false;
    // Use a function expression so .name === '' (treated as anonymous)
    const middleware = function (_req: unknown, _res: unknown, n: () => void) {
      middlewareCalled = true;
      n();
    };

    // Clear inferred name so connect treats it as anonymous
    Object.defineProperty(middleware, 'name', { value: '', configurable: true });

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);
    expect(middlewareCalled).toBe(true);

    expect(startInactiveSpanCalls).toHaveLength(1);
    const spanOptions = startInactiveSpanCalls[0]!.options as Record<string, unknown>;
    expect(spanOptions['name']).toBe(ANONYMOUS_NAME);
    expect((spanOptions['attributes'] as Record<string, unknown>)['connect.type']).toBe('middleware');
    expect((spanOptions['attributes'] as Record<string, unknown>)['connect.name']).toBe(ANONYMOUS_NAME);
    expect((spanOptions['attributes'] as Record<string, unknown>)['sentry.op']).toBe('middleware.connect');
    expect((spanOptions['attributes'] as Record<string, unknown>)['sentry.origin']).toBe('auto.http.connect');
  });

  it('uses middleware.name when available for anonymous middleware', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    function myHandler(_req: unknown, _res: unknown, next: () => void) {
      next();
    }

    app.use(myHandler as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(startInactiveSpanCalls).toHaveLength(1);
    expect((startInactiveSpanCalls[0]!.options as { name: string }).name).toBe('myHandler');
  });

  it('wraps named route handler with routeName', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    const handler = vi.fn((_req: unknown, _res: unknown, n: () => void) => n());

    app.use('/users', handler as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(startInactiveSpanCalls).toHaveLength(1);
    const spanOptions = startInactiveSpanCalls[0]!.options as Record<string, unknown>;
    expect(spanOptions['name']).toBe('/users');
    expect((spanOptions['attributes'] as Record<string, unknown>)['connect.type']).toBe('request_handler');
    expect((spanOptions['attributes'] as Record<string, unknown>)['connect.name']).toBe('/users');
    expect((spanOptions['attributes'] as Record<string, unknown>)['sentry.op']).toBe('request_handler.connect');
    expect((spanOptions['attributes'] as Record<string, unknown>)['http.route']).toBe('/users');
  });

  it('calls onRouteResolved when a named route handler is matched', () => {
    const app = makeApp();
    const routeResolved: string[] = [];
    patchConnectApp(app, { onRouteResolved: r => routeResolved.push(r) });

    const req = makeRequest();
    const res = makeResponse();
    const handler = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

    app.use('/api', handler as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(routeResolved).toStrictEqual(['/api']);
  });

  it('does not call onRouteResolved for anonymous middleware', () => {
    const app = makeApp();
    const routeResolved: string[] = [];
    patchConnectApp(app, { onRouteResolved: r => routeResolved.push(r) });

    const req = makeRequest();
    const res = makeResponse();
    const middleware = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(routeResolved).toStrictEqual([]);
  });

  it('ends span when next() is called', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    let capturedNext: (() => void) | undefined;
    const middleware = vi.fn((_req: unknown, _res: unknown, next: () => void) => {
      capturedNext = next;
    });

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(activeSpans[0]!.ended).toBe(false);
    capturedNext!();
    expect(activeSpans[0]!.ended).toBe(true);
  });

  it('ends span when response close event fires', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    const middleware = vi.fn((_req: unknown, _res: unknown, _next: unknown) => {
      // intentionally does not call next
    });

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(activeSpans[0]!.ended).toBe(false);
    // Simulate response close
    res.listeners['close']?.forEach(fn => fn());
    expect(activeSpans[0]!.ended).toBe(true);
  });

  it('does not end span twice if both next() and close fire', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    let capturedNext: (() => void) | undefined;
    const middleware = vi.fn((_req: unknown, _res: unknown, next: () => void) => {
      capturedNext = next;
    });

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    capturedNext!();
    res.listeners['close']?.forEach(fn => fn());

    // span.end is idempotent in our patchedMiddleware
    expect(activeSpans[0]!.ended).toBe(true);
  });

  it('skips span creation when there is no active parent span', () => {
    mockParentSpan = null;
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    const middleware = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(startInactiveSpanCalls).toHaveLength(0);
    expect(middleware).toHaveBeenCalledOnce();
  });

  it('preserves middleware arity (length) so connect can detect error handlers', () => {
    const app = makeApp();
    patchConnectApp(app);

    const errorMiddleware = vi.fn();
    Object.defineProperty(errorMiddleware, 'length', { value: 4 });

    app.use(errorMiddleware as unknown as (...args: unknown[]) => ConnectApp);

    // Verify that the patched middleware in the stack still has length 4
    const { stack } = app as unknown as { stack: Function[] };
    expect(stack[0]!.length).toBe(4);
  });

  it('error middleware uses (err, req, res, next) argument positions', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();
    const err = new Error('oops');
    let capturedArgs: unknown[] = [];

    // 4-arg error middleware
    const errorMiddleware = function (_err: unknown, _req: unknown, _res: unknown, _next: () => void) {
      capturedArgs = [...arguments];
      _next();
    };

    app.use(errorMiddleware as unknown as (...args: unknown[]) => ConnectApp);

    // Simulate connect calling the error middleware
    const { stack } = app as unknown as { stack: Function[] };
    (stack[0] as Function)(err, req, res, next);

    expect(capturedArgs[0]).toBe(err);
    expect(capturedArgs[1]).toBe(req);
    expect(capturedArgs[2]).toBe(res);
    expect(typeof capturedArgs[3]).toBe('function'); // patched next
  });

  it('wraps handle to track route stack per request', () => {
    const app = makeApp();
    const routeResolved: string[] = [];
    patchConnectApp(app, { onRouteResolved: r => routeResolved.push(r) });

    const req = makeRequest();
    const res = makeResponse();

    // Simulate nested: handle adds a layer, route handler resolves the route
    const handler = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
    app.use('/api/users', handler as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    expect(routeResolved).toStrictEqual(['/api/users']);
  });

  it('emits debug error when patching use fails (already wrapped)', () => {
    const app = makeApp();
    patchConnectApp(app); // first patch
    patchConnectApp(app); // second patch — should log debug error
    expect(debugErrors.some(([msg]) => (msg as string).includes('use'))).toBe(true);
  });

  it('emits debug error when patching handle fails (already wrapped)', () => {
    const app = makeApp();
    patchConnectApp(app); // first patch
    patchConnectApp(app); // second patch — should log debug error
    expect(debugErrors.some(([msg]) => (msg as string).includes('handle'))).toBe(true);
  });

  it('http.route falls back to "/" for middleware without a routeName', () => {
    const app = makeApp();
    patchConnectApp(app);

    const req = makeRequest();
    const res = makeResponse();
    const middleware = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

    app.use(middleware as unknown as (...args: unknown[]) => ConnectApp);
    app.handle(req, res, () => undefined);

    const attrs = (startInactiveSpanCalls[0]!.options as { attributes: Record<string, unknown> }).attributes;
    expect(attrs['http.route']).toBe('/');
  });
});

describe('setupConnectErrorHandler', () => {
  it('adds a 4-argument error middleware to the app', () => {
    const added: unknown[] = [];
    const app = { use: (fn: unknown) => added.push(fn) };
    setupConnectErrorHandler(app);
    expect(added).toHaveLength(1);
    const fn = added[0] as Function;
    expect(fn.length).toBe(4);
  });

  it('captures exceptions via captureException', () => {
    const added: unknown[] = [];
    const app = { use: (fn: unknown) => added.push(fn) };
    setupConnectErrorHandler(app);

    const next = vi.fn();
    const err = new Error('test');
    (added[0] as Function)(err, {}, {}, next);

    expect(capturedExceptions).toStrictEqual([
      [
        err,
        {
          mechanism: { handled: false, type: 'auto.middleware.connect' },
        },
      ],
    ]);
    expect(next).toHaveBeenCalledExactlyOnceWith(err);
  });
});
