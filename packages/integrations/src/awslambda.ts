import * as Sentry from '@sentry/browser';
import { EventProcessor, Hub, Integration, Scope } from '@sentry/types';

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
  private _awsContext: {
    getRemainingTimeInMillis: () => number;
    callbackWaitsForEmptyEventLoop: boolean;
    awsRequestId: string;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    logGroupName: string;
    logStreamName: string;
  };

  /**
   * timeout flag.
   */
  private _timeoutWarning?: boolean = false;

  /**
   * @inheritDoc
   */

  /**
   * flush time in milliseconds to set time for flush.
   */
  private _flushTime?: number;

  public constructor(options: { context?: any; timeoutWarning?: boolean; flushTime?: number } = {}) {
    this._awsContext = options.context;
    this._timeoutWarning = options.timeoutWarning;
    this._flushTime = options.flushTime;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const lambdaBootstrap: any = require.main;

    /** configured time to timeout error and calculate execution time */
    const configuredTimeInMilliseconds = this._awsContext.getRemainingTimeInMillis();

    if (!this._awsContext && !lambdaBootstrap) {
      return;
    }
    const processEnv: any = process.env;
    /** rapid runtime instance */
    const rapidRuntime = lambdaBootstrap.children[0].exports;

    /** handler that is invoked in case of unhandled and handled exception */
    const originalPostInvocationError = rapidRuntime.prototype.postInvocationError;

    const hub = getCurrentHub && getCurrentHub();

    /**
     * This function sets Additional Runtime Data which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setAdditionalRuntimeData = (scope: Scope): void => {
      scope.setContext('Runtime', {
        Name: 'node',
        // global.process.version return the version of node
        Version: global.process.version,
      });
    };

    /**
     * This function sets Additional Lambda Parameters which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setAdditionalLambdaParameters = (scope: Scope): void => {
      const remainingTimeInMillisecond: number = this._awsContext.getRemainingTimeInMillis();
      const executionTime: number = configuredTimeInMilliseconds - remainingTimeInMillisecond;

      scope.setExtra('lambda', {
        aws_request_id: this._awsContext.awsRequestId,
        function_name: this._awsContext.functionName,
        function_version: this._awsContext.functionVersion,
        invoked_function_arn: this._awsContext.invokedFunctionArn,
        execution_duration_in_millis: executionTime,
        remaining_time_in_millis: this._awsContext.getRemainingTimeInMillis(),
      });
    };

    /**
     * This function use to generate cloud watch url
     */
    const cloudwatchUrl = (): string => {
      /**
       * processEnv.AWS_REGION -  this parameters given the AWS region
       * processEnv.AWS_LAMBDA_FUNCTION_NAME - this parameter provides the AWS Lambda Function name
       */
      return `https://${processEnv.AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${processEnv.AWS_REGION}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${processEnv.AWS_LAMBDA_FUNCTION_NAME}`;
    };

    /**
     * This function sets Cloud Watch Logs data which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     * @hidden
     */
    const setCloudwatchLogsData = (scope: Scope): void => {
      scope.setExtra('cloudwatch logs', {
        log_group: this._awsContext.logGroupName,
        log_stream: this._awsContext.logStreamName,
        url: cloudwatchUrl(),
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
      scope.setTag('server_name', processEnv._AWS_XRAY_DAEMON_ADDRESS);
      scope.setTag('url', `awslambda:///${this._awsContext.functionName}`);
    };

    /**
     * setting parameters in scope which will be displayed as additional data in Sentry dashboard
     * @hidden
     */
    const setParameters = (): void => {
      // setting parameters in scope which will be displayed as additional data in Sentry dashboard
      hub.configureScope((scope: Scope) => {
        setTags(scope);
        // runtime
        setAdditionalRuntimeData(scope);
        // setting the lambda parameters
        setAdditionalLambdaParameters(scope);
        // setting the cloudwatch logs parameter
        setCloudwatchLogsData(scope);
        // setting the sys.argv parameter
        scope.setExtra('sys.argv', process.argv);
      });
    };

    // timeout warning buffer for timeout error
    const timeoutWarningBuffer: number = 1500;

    /** check timeout flag and checking if configured Time In Milliseconds is greater than timeout Warning Buffer */
    if (this._timeoutWarning === true && configuredTimeInMilliseconds > timeoutWarningBuffer) {
      const configuredTimeInSec = Math.floor(configuredTimeInMilliseconds / 1000);
      const configuredTimeInMilli = configuredTimeInSec * 1000;

      /**
       * This function is invoked when there is timeout error
       * Here, we make sure the error has been captured by Sentry Dashboard
       * and then re-raise the exception
       * @param configuredTime  - configured time in seconds
       * @hidden
       */
      const timeOutError = (configuredTime: number): void => {
        setTimeout(() => {
          /**
           * setting parameters in scope which will be displayed as additional data in Sentry dashboard
           */
          setParameters();

          const error = new Error(
            `WARNING : Function is expected to get timed out. Configured timeout duration = ${configuredTimeInSec +
              1} seconds.`,
          );

          /** capturing the exception and re-directing it to the Sentry Dashboard */
          hub.captureException(error);
          Sentry.flush(this._flushTime);
        }, configuredTime);
      };

      this._awsContext.callbackWaitsForEmptyEventLoop = false;
      timeOutError(configuredTimeInMilli);
    }

    /**
     * unhandled and handled exception
     * @param error  - holds the error captured in AWS Lambda Function
     * @param id  - holds event id value
     * @param callback  - callback function
     */
    rapidRuntime.prototype.postInvocationError = async function(
      error: Error,
      id: string,
      callback: () => void,
    ): Promise<void> {
      /**
       * setting parameters in scope which will be displayed as additional data in Sentry dashboard
       */
      setParameters();

      /** capturing the exception and re-directing it to the Sentry Dashboard */
      hub.captureException(error);
      await Sentry.flush(this.flushTime);

      /**
       * Here, we make sure the error has been captured by Sentry Dashboard
       * and then re-raised the exception
       */
      originalPostInvocationError.call(this, error, id, callback);
    };
  }
}
