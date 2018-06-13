import { Hub as BaseHub, Layer } from '@sentry/hub';

/**
 * Node specific implemention of Hub.
 */
export class Hub extends BaseHub {
  /**
   * @inheritDoc
   */
  public getStackTop(): Layer {
    return this.getDomainStackTop();
  }

  /** Tries to return the top most ScopeLayer from the domainStack. */
  private getDomainStackTop(): Layer {
    const stack = getDomainStack();

    if (stack.length === 0) {
      const client = this.getCurrentClient();
      stack.push({
        client,
        scope: this.createScope(),
        type: 'domain',
      });
    }

    return stack[stack.length - 1];
  }
}

/** Checks for an active domain and returns its stack, if present. */
function getDomainStack(): Layer[] {
  const domain = require('domain');
  // tslint:disable-next-line:no-unsafe-any
  const active = domain.active;
  if (!active) {
    return [];
  }
  // tslint:disable-next-line:no-unsafe-any
  let carrier = active.__SENTRY__;
  if (!carrier) {
    // tslint:disable-next-line:no-unsafe-any
    active.__SENTRY__ = carrier = { hub: {} };
  }

  // tslint:disable-next-line:no-unsafe-any
  return carrier.stack;
}
