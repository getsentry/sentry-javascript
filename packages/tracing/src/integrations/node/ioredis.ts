import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, SpanContext } from '@sentry/types';
import { fill, loadModule, logger } from '@sentry/utils';

type CommandArgs = string | Buffer | number | unknown[];

interface Command {
  name: string;
  args: CommandArgs[];
}

interface IORedisInstance {
  prototype: {
    sendCommand: (command: Command, ...args: unknown[]) => unknown;
  };
}

interface IORedisOptions {
  /**
   * Location of the IORedis package
   * This allows users to specify the package directory in case
   * they are using wrappers around IORedis
   *
   * Default is 'ioredis'
   */
  moduleLocation?: string;
}

/** Tracing integration for the IORedis library */
export class IORedis implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'IORedis';

  /**
   * @inheritDoc
   */
  public name: string = IORedis.id;

  /**
   * Location of the IORedis package
   */
  private _moduleLocation: string;

  /**
   * @inheritDoc
   */
  public constructor({ moduleLocation = 'ioredis' }: IORedisOptions = {}) {
    this._moduleLocation = moduleLocation;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const pkg = loadModule<IORedisInstance>(this._moduleLocation);

    if (!pkg) {
      logger.error(`IORedis integration was unable to require \`${this._moduleLocation}\` package.`);
      return;
    }

    this._patchOperation(pkg, getCurrentHub);
  }

  /**
   *  Patches the sendCommand function to utilize tracing
   */
  private _patchOperation(ioredis: IORedisInstance, getCurrentHub: () => Hub): void {
    fill(ioredis.prototype, 'sendCommand', function(orig: () => Promise<unknown>) {
      return function(this: unknown, command: Command, ...args: unknown[]) {
        const parentSpan = getCurrentHub().getScope()?.getSpan();

        const span = parentSpan?.startChild({
          op: 'redis',
          description: command.name,
          data: {
            arguments: command.args.toString(),
          }
        });

        const responsePromise = orig.call(this, command, ...args) as Promise<unknown>;

        return responsePromise.then((res: unknown) => {
          span?.finish();
          return res;
        });
      };
    });
  }
}
