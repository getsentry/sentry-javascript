import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Integration } from '@sentry/types';
import * as lsmod from 'lsmod';

let moduleCache: { [key: string]: string };

/** Add node modules / packages to the event */
export class Modules implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Modules.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'Modules';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(event => {
      if (!getCurrentHub().getIntegration(Modules)) {
        return event;
      }
      return {
        ...event,
        modules: this.getModules(),
      };
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
