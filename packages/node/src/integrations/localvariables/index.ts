import type { Event, EventHint, Integration } from '@sentry/types';
import type { NodeClient } from '../../client';
import { NODE_VERSION } from '../../nodeVersion';
import type { Options } from './common';
import { LocalVariablesAsync } from './localvariables-async';
import { LocalVariablesSync } from './localvariables-sync';

/**
 * Adds local variables to exception frames
 */
export class LocalVariables implements Integration {
  public static id: string = 'LocalVariables';

  public readonly name: string = LocalVariables.id;
  private readonly _integration: Integration | undefined;

  public constructor(_options: Options = {}) {
    this._integration =
      (NODE_VERSION.major || 0) < 19 ? new LocalVariablesSync(_options) : new LocalVariablesAsync(_options);
  }

  /** @inheritdoc */
  public setupOnce(): void {
    //
  }

  /** @inheritdoc */
  public setup(client: NodeClient): void {
    this._integration?.setup?.(client);
  }

  /** @inheritdoc */
  public processEvent(event: Event, hint: EventHint, client: NodeClient): Event | PromiseLike<Event | null> | null {
    return this._integration?.processEvent?.(event, hint, client) || event;
  }
}
