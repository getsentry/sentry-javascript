import { EventProcessor, Hub, Integration, Scope } from '@sentry/types';

interface AWSLambdaContext {
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
  awsRequestId: string;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  logGroupName: string;
  logStreamName: string;
}

interface Module {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exports: any;
  id: string;
  filename: string;
  loaded: boolean;
  parent: Module | null;
  children: Module[];
  path: string;
  paths: string[];
}
/**
 * NodeJS integration
 *
 * Provides a mechanism for NodeJS
 * that raises an exception for handled, unhandled, timeout and similar times of error
 * and captures the same in Sentry Dashboard
 */
export class AWSLambda implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'AWSLambda';

  /**
   * @inheritDoc
   */
  public name: string = AWSLambda.id;

  /**
   * context.
   */
  private _awsContext: AWSLambdaContext = {} as AWSLambdaContext;

  /**
   * timeout flag.
   */
  private _timeoutWarning?: boolean = false;

  /**
   * flush time in milliseconds to set time for flush.
   */
  private _flushTimeout: number = 2000;

  /**
   *  Assign Hub
   */
  private _hub: Hub = {} as Hub;

  public constructor() {
    // empty constructor
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._hub = getCurrentHub();
  }

  /**
   * @inheritDoc
   */
  public providedContext(
    context: AWSLambdaContext,
    timeoutWarning: boolean = false,
    flushTimeout: number = 2000,
  ): void {
    if (context) {
      this._awsContext = context;
    }
    if (flushTimeout) {
      this._flushTimeout = flushTimeout;
    }
    if (timeoutWarning) {
      this._timeoutWarning = timeoutWarning;
    }
    const flushTime = this._flushTimeout;
    const lambdaBootstrap: Module | undefined = require.main;

    if (!this._awsContext.awsRequestId || !lambdaBootstrap) {
      return;
    }
    /** configured time to timeout error and calculate execution time */
    const configuredTimeInMilliseconds =
      this._awsContext.getRemainingTimeInMillis && this._awsContext.getRemainingTimeInMillis();

    /** rapid runtime instance */
    let rapidRuntime;
    let originalPostInvocationError = function(): void {
      return;
    };
    if (lambdaBootstrap.children && lambdaBootstrap.children.length) {
      rapidRuntime = lambdaBootstrap.children[0].exports;
      /** handler that is invoked in case of unhandled and handled exception */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      originalPostInvocationError = rapidRuntime.prototype.postInvocationError;
    }

    const hub = this._hub;

    /**
     * This function sets Additional Runtime Data which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setAdditionalRuntimeData = (scope: Scope): void => {
      scope.setContext('runtime', {
        name: 'node',
        version: global.process.version,
      });
    };

    /**
     * This function sets Additional Lambda Parameters which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setAdditionalLambdaParameters = (scope: Scope): void => {
      const remainingTimeInMillisecond: number =
        this._awsContext.getRemainingTimeInMillis && this._awsContext.getRemainingTimeInMillis();
      const executionTime: number = configuredTimeInMilliseconds - remainingTimeInMillisecond;

      scope.setContext('lambda', {
        aws_request_id: this._awsContext.awsRequestId,
        function_name: this._awsContext.functionName,
        function_version: this._awsContext.functionVersion,
        invoked_function_arn: this._awsContext.invokedFunctionArn,
        execution_duration_in_millis: executionTime,
        remaining_time_in_millis: remainingTimeInMillisecond,
      });
    };

    /**
     * This variable use to generate cloud watch url
     * process.env.AWS_REGION -  this parameters given the AWS region
     * process.env.AWS_LAMBDA_FUNCTION_NAME - this parameter provides the AWS Lambda Function name
     */
    const cloudwatchUrl: string = `https://${process.env.AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${process.env.AWS_LAMBDA_FUNCTION_NAME}`;

    /**
     * This function sets Cloud Watch Logs data which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setCloudwatchLogsData = (scope: Scope): void => {
      scope.setContext('cloudwatch.logs', {
        log_group: this._awsContext.logGroupName,
        log_stream: this._awsContext.logStreamName,
        url: cloudwatchUrl,
      });
    };

    /**
     * This function sets tags which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setTags = (scope: Scope): void => {
      scope.setTag('runtime', `node${global.process.version}`);
      scope.setTag('transaction', this._awsContext.functionName);
      scope.setTag('runtime.name', 'node');
      scope.setTag('server_name', process.env._AWS_XRAY_DAEMON_ADDRESS || '');
      scope.setTag('url', `awslambda:///${this._awsContext.functionName}`);
      scope.setTag('handled', 'no');
      scope.setTag('mechanism', 'awslambda');
    };

    // timeout warning buffer for timeout error
    const timeoutWarningBuffer: number = 1500;
    const configuredTimeInSec = Math.floor(configuredTimeInMilliseconds / 1000);
    const configuredTimeInMilli = configuredTimeInSec * 1000;

    /** check timeout flag and checking if configured Time In Milliseconds is greater than timeout Warning Buffer */
    if (this._timeoutWarning === true && configuredTimeInMilliseconds > timeoutWarningBuffer) {
      this._awsContext.callbackWaitsForEmptyEventLoop = false;

      setTimeout(() => {
        const error = new Error(
          `WARNING : Function is expected to get timed out. Configured timeout duration = ${configuredTimeInSec +
            1} seconds.`,
        );

        // setting parameters in scope which will be displayed as additional data in Sentry dashboard
        hub.withScope((scope: Scope) => {
          setTags(scope);
          // runtime
          setAdditionalRuntimeData(scope);
          // setting the lambda parameters
          setAdditionalLambdaParameters(scope);
          // setting the cloudwatch logs parameter
          setCloudwatchLogsData(scope);
          // setting the sys.argv parameter
          scope.setExtra('sys.argv', process.argv);
          /** capturing the exception and re-directing it to the Sentry Dashboard */
          hub.captureException(error);
        });
      }, configuredTimeInMilli);
      void hub.getClient()?.flush(flushTime);
    }

    /**
     * unhandled and handled exception
     * @param error  - holds the error captured in AWS Lambda Function
     * @param id  - holds event id value
     * @param callback  - callback function
     */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rapidRuntime.prototype.postInvocationError = async function(
      error: Error,
      id: string,
      callback: () => void,
    ): Promise<void> {
      // setting parameters in scope which will be displayed as additional data in Sentry dashboard
      hub.withScope((scope: Scope) => {
        setTags(scope);
        // runtime
        setAdditionalRuntimeData(scope);
        // setting the lambda parameters
        setAdditionalLambdaParameters(scope);
        // setting the cloudwatch logs parameter
        setCloudwatchLogsData(scope);
        // setting the sys.argv parameter
        scope.setExtra('sys.argv', process.argv);
        /** capturing the exception and re-directing it to the Sentry Dashboard */
        hub.captureException(error);
      });

      /** capturing the exception and re-directing it to the Sentry Dashboard */
      const client = hub.getClient();
      if (client) {
        await client.flush(flushTime);
      }

      /**
       * Here, we make sure the error has been captured by Sentry Dashboard
       * and then re-raised the exception
       */
      originalPostInvocationError.call(this, error, id, callback);
    };
  }
}

export const AWSLambdaIntegration = new AWSLambda();
