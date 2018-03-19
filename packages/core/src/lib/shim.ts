import { Breadcrumb, Frontend } from '..';

type StackType = 'process' | 'domain' | 'local';

/**
 * TODO
 */
class StackLayer {
  public constructor(
    public type: StackType,
    public data: any = {},
    public frontend?: Frontend,
  ) {}
}

/**
 * TODO
 */
interface Global {
  __SENTRY__: {
    processStack: StackLayer[];
  };
}

declare var global: Global;

global.__SENTRY__ = {
  processStack: [],
};

/**
 * TODO
 */
function _getProcessStack(): StackLayer[] {
  return global.__SENTRY__.processStack;
}

/**
 * TODO
 */
function _getProcessStackTop(): StackLayer {
  const stack = _getProcessStack();
  if (stack.length === 0) {
    stack.push(new StackLayer('process'));
  }
  return stack[stack.length - 1];
}

/**
 * TODO
 */
function _getDomainStack(): StackLayer[] | undefined {
  return undefined;
  // TODO real node domain handling
  // if (!domain.active) {
  //   return undefined;
  // }
  // let sentry = domain.active.__SENTRY__;
  // if (!sentry) {
  //   domain.active.__SENTRY__ = sentry = { domainStack: [] };
  // }
  // return sentry.domainStack;
}

/**
 * TODO
 */
function _getDomainStackTop(): StackLayer | undefined {
  const stack = _getDomainStack();
  if (stack === undefined) {
    return undefined;
  }
  if (stack.length === 0) {
    stack.push(new StackLayer('domain', {}, _getProcessStackTop().frontend));
  }
  return stack[stack.length - 1];
}

/**
 * TODO
 */
function getStackTop(): StackLayer {
  return _getDomainStackTop() || _getProcessStackTop();
}

/**
 * TODO
 */
function currentFrontend(): Frontend | undefined {
  return getStackTop().frontend;
}

/**
 * TODO
 */
function bindFrontend(frontend: Frontend): void {
  getStackTop().frontend = frontend;
}

/**
 * TODO
 */
function pushScope(frontend?: Frontend): void {
  const layer = new StackLayer('local', {}, frontend || currentFrontend());
  const stack = _getDomainStack();
  if (stack !== undefined) {
    stack.push(layer);
  } else {
    _getProcessStack().push(layer);
  }
}

/**
 * TODO
 */
function popScope(): boolean {
  const stack = _getDomainStack();
  if (stack !== undefined) {
    return stack.pop() !== undefined;
  }
  return _getProcessStack().pop() !== undefined;
}

/**
 * TODO
 */
function withScope(callback: () => void): void {
  pushScope();
  try {
    callback();
  } finally {
    popScope();
  }
}

// api

/**
 * TODO
 */
async function captureException(error: any): Promise<void> {
  const top = getStackTop();
  if (top.frontend) {
    return top.frontend.captureException(error, top.data);
  }
}

/**
 * TODO
 */
function addBreadcrumb(breadcrumb: Breadcrumb) {
  const top = getStackTop();
  if (top.frontend) {
    return top.frontend.addBreadcrumb(breadcrumb, top.data);
  }
}
