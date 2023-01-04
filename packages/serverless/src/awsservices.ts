import { getCurrentHub } from '@sentry/node';
import type { Integration, Span, Transaction } from '@sentry/types';
import { fill } from '@sentry/utils';
// 'aws-sdk/global' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import type * as AWS from 'aws-sdk/global';

type GenericParams = { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type MakeRequestCallback<TResult> = (err: AWS.AWSError, data: TResult) => void;
// This interace could be replaced with just type alias once the `strictBindCallApply` mode is enabled.
interface MakeRequestFunction<TParams, TResult> extends CallableFunction {
  (operation: string, params?: TParams, callback?: MakeRequestCallback<TResult>): AWS.Request<TResult, AWS.AWSError>;
}
interface AWSService {
  serviceIdentifier: string;
}

/** AWS service requests tracking */
export class AWSServices implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'AWSServices';

  /**
   * @inheritDoc
   */
  public name: string = AWSServices.id;

  private readonly _optional: boolean;

  public constructor(options: { optional?: boolean } = {}) {
    this._optional = options.optional || false;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const awsModule = require('aws-sdk/global') as typeof AWS;
      fill(awsModule.Service.prototype, 'makeRequest', wrapMakeRequest);
    } catch (e) {
      if (!this._optional) {
        throw e;
      }
    }
  }
}

/** */
function wrapMakeRequest<TService extends AWSService, TResult>(
  orig: MakeRequestFunction<GenericParams, TResult>,
): MakeRequestFunction<GenericParams, TResult> {
  return function (this: TService, operation: string, params?: GenericParams, callback?: MakeRequestCallback<TResult>) {
    let transaction: Transaction | undefined;
    let span: Span | undefined;
    const scope = getCurrentHub().getScope();
    if (scope) {
      transaction = scope.getTransaction();
    }
    const req = orig.call(this, operation, params);
    req.on('afterBuild', () => {
      if (transaction) {
        span = transaction.startChild({
          description: describe(this, operation, params),
          op: 'http.client',
        });
      }
    });
    req.on('complete', () => {
      if (span) {
        span.finish();
      }
    });

    if (callback) {
      req.send(callback);
    }
    return req;
  };
}

/** Describes an operation on generic AWS service */
function describe<TService extends AWSService>(service: TService, operation: string, params?: GenericParams): string {
  let ret = `aws.${service.serviceIdentifier}.${operation}`;
  if (params === undefined) {
    return ret;
  }
  switch (service.serviceIdentifier) {
    case 's3':
      ret += describeS3Operation(operation, params);
      break;
    case 'lambda':
      ret += describeLambdaOperation(operation, params);
      break;
  }
  return ret;
}

/** Describes an operation on AWS Lambda service */
function describeLambdaOperation(_operation: string, params: GenericParams): string {
  let ret = '';
  if ('FunctionName' in params) {
    ret += ` ${params.FunctionName}`;
  }
  return ret;
}

/** Describes an operation on AWS S3 service */
function describeS3Operation(_operation: string, params: GenericParams): string {
  let ret = '';
  if ('Bucket' in params) {
    ret += ` ${params.Bucket}`;
  }
  return ret;
}
