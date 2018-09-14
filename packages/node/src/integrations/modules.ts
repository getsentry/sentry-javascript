import { Scope } from '@sentry/hub';
import { Integration } from '@sentry/types';
import * as lsmod from 'lsmod';
import { NodeOptions } from '../backend';
import { getCurrentHub } from '../hub';

let moduleCache: { [key: string]: string };

/** Add node modules / packages to the event */
export class Modules implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Modules';

  /**
   * @inheritDoc
   */
  public install(_: NodeOptions = {}): void {
    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async event => ({
        ...event,
        modules: this.getModules(),
      }));
    });
  }

  /** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
  private getModules(): { [key: string]: string } {
    if (!moduleCache) {
      // tslint:disable-next-line:no-unsafe-any
      moduleCache = lsmod();
    }
    return moduleCache;
  }
}
