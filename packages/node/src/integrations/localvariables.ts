import { parseSemver } from '@sentry/utils';

const nodeVersion = parseSemver(process.versions.node);

if ((nodeVersion.major || 0) < 14) {
  throw new Error('LocalVariables integration requires node.js >=v14');
}

import { Event, EventProcessor } from '@sentry/types';
import { Debugger, InspectorNotification, Runtime, Session } from 'inspector';

/**
 * Promise API is available as `Experimental` and in Node 19 only.
 *
 * Callback-based API is `Stable` since v14 and `Experimental` since v8.
 * Because of that, we are creating our own `AsyncSession` class.
 *
 * https://nodejs.org/docs/latest-v19.x/api/inspector.html#promises-api
 * https://nodejs.org/docs/latest-v14.x/api/inspector.html
 */
class AsyncSession extends Session {
  public async getProperties(objectId: string): Promise<Runtime.PropertyDescriptor[]> {
    return new Promise((resolve, reject) => {
      this.post(
        'Runtime.getProperties',
        {
          objectId,
          ownProperties: true,
        },
        (err, params) => {
          if (err) {
            reject(err);
          } else {
            resolve(params.result);
          }
        },
      );
    });
  }
}

/** */
export class LocalVariables {
  public static id: string = 'LocalVariables';

  public name: string = LocalVariables.id;

  private readonly _session: AsyncSession;

  private _props: Record<string, unknown> | undefined;

  public constructor() {
    this._session = new AsyncSession();
    this._session.connect();
    this._session.on('Debugger.paused', this._handlePaused.bind(this));
    this._session.post('Debugger.enable');
    this._session.post('Debugger.setPauseOnExceptions', { state: 'all' });
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(async event => this._addLocalVariables(event));
  }

  /** */
  private async _handlePaused(event: InspectorNotification<Debugger.PausedEventDataType>): Promise<void> {
    // TODO: Exceptions only for now
    // TODO: Handle all frames
    if (event.params.reason == 'exception') {
      const topFrame = event.params.callFrames[0];
      const localScope = topFrame.scopeChain.find(scope => scope.type === 'local');

      if (localScope?.object?.objectId) {
        this._props = await this._unrollProps(await this._session.getProperties(localScope.object.objectId));
        // eslint-disable-next-line no-console
        console.log(this._props);
      }
    }
  }

  /** */
  private async _unrollProps(props: Runtime.PropertyDescriptor[]): Promise<Record<string, unknown>> {
    const unrolled: Record<string, unknown> = {};

    for (const prop of props) {
      if (prop?.value?.objectId && prop?.value.className === 'Array') {
        unrolled[prop.name] = await this._unrollArray(prop.value.objectId);
      } else if (prop?.value?.objectId && prop?.value?.className === 'Object') {
        unrolled[prop.name] = await this._unrollObject(prop.value.objectId);
      } else if (prop?.value?.value || prop?.value?.description) {
        unrolled[prop.name] = prop.value.value || `<${prop.value.description}>`;
      }
    }

    return unrolled;
  }

  /** */
  private async _unrollArray(objectId: string): Promise<unknown> {
    const props = await this._session.getProperties(objectId);
    return props
      .filter(v => v.name !== 'length')
      .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
      .map(v => v?.value?.value);
  }

  /** */
  private async _unrollObject(objectId: string): Promise<Record<string, unknown>> {
    const props = await this._session.getProperties(objectId);
    return props
      .map<[string, unknown]>(v => [v.name, v?.value?.value])
      .reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {} as Record<string, unknown>);
  }

  // TODO: This is not 100% safe, as we cannot assume it will be _this_ exception from debugger
  // we will need to keep a LRU-cache or similar in order to make it reliable.
  // TODO: Handle all frames
  /** */
  private async _addLocalVariables(event: Event): Promise<Event> {
    if (event?.exception?.values?.[0]?.stacktrace?.frames) {
      event.exception.values[0].stacktrace.frames.reverse()[0].vars = {
        ...this._props,
      };

      this._props = undefined;
    }

    return event;
  }
}
