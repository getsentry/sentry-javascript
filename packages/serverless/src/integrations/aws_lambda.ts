import { EventProcessor, Hub, Integration, Scope } from '@sentry/types';
import * as Sentry from '@sentry/core';
import { setTimeout } from 'timers';

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
   * Returns current hub
   */
  private getCurrentHub?: () => Hub;

  /**
   * context.
   */
  private awsContext: any;

  /**
   * timeout flag.
   */
  private timeoutWarning: boolean = false;

  /**
   * configured time in miliseconds.
   */
  private configuredTimeInMilliseconds: number;

  /**
   * @inheritDoc
   */
  public constructor(
    options: { awslambda?: any; context?: any; timeoutWarning?: any; configuredTimeInMilliseconds?: number } = {},
  ) {
    this.awsContext = options.context;
    this.timeoutWarning = options.timeoutWarning;
    this.configuredTimeInMilliseconds = options.configuredTimeInMilliseconds as number;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // lambda-bootstrap
    const lambdaBootstrap = require.main;

    if (!this.awsContext && !lambdaBootstrap) {
      return;
    }

    const nodeJs: string = 'Nodejs';

    // capturing this context
    const setupOnceContext = this;

    // rapidruntime
    const rapidRuntime = lambdaBootstrap?.children[0].exports;

    // handler that is invoked in case of unhandled and handled exception
    const invokedFunction = rapidRuntime.prototype.postInvocationError;

    this.getCurrentHub = getCurrentHub;

    const hub = this.getCurrentHub && this.getCurrentHub();

    // configured time
    this.configuredTimeInMilliseconds = this.awsContext.getRemainingTimeInMillis();

    const timeoutWarningBuffer: number = 1500;
    const millisToSeconds: number = 1000;

    if (this.configuredTimeInMilliseconds > timeoutWarningBuffer) {
      const configuredTimeInSec = this.configuredTimeInMilliseconds / millisToSeconds;
      const configuredTime = Math.floor(configuredTimeInSec);
      if (this.timeoutWarning === true) {
        timeOutError(configuredTime);
      }
    }

    /**
     *  @inheritdoc
     */
    function timeOutError(configuredTime: number): void {
      setTimeout(() => {
        Sentry.addGlobalEventProcessor((event) => {
          if (Sentry.getCurrentHub().getIntegration(AWSLambda)) {
            event = event;
          }
          return event;
        });

        if (hub && hub.getIntegration(AWSLambda)) {
          // setting parameters in scope which will be displayed as additional data in Sentry dashboard
          hub.configureScope((scope: Scope) => {
            // tags
            setTags(scope);
            // memory usage and execution time
            setMemoryUsageAndExecutionTime(scope);
            // runtime
            setAdditionalRuntimeData(scope);
            // setting the lambda parameters
            setAdditionalLambdaParameters(scope);
            // setting the cloudwatch logs parameter
            setCloudwatchLogsData(scope);
            // setting the sys.argv parameter
            scope.setExtra('sys.argv', process.argv);
          });
        }

        const error = Error(
          `WARNING : Function is expected to get timed out. Configured timeout duration = ${
            configuredTime + 1
          } seconds.`,
        );
        /** capturing the exception and re-directing it to the Sentry Dashboard */
        hub.captureException(error);
      }, configuredTime);
    }

    /**
     *  @inheritdoc
     */
    function getMemoryUsage(): number {
      const used: any = process.memoryUsage();
      for (const key in used) {
        if (key === 'rss') {
          return Math.round(used[key] / 1024 / 1024);
        }
      }
      return 0;
    }

    function setAdditionalRuntimeData(scope: Scope): void {
      scope.setContext('Runtime', {
        Name: nodeJs,
        // global.process.version return the version of node
        Version: global.process.version,
      });
    }

    /**
     *  @inheritdoc
     */
    function setMemoryUsageAndExecutionTime(scope: Scope): void {
      // remaining time at this point of time
      const remainingTimeInMillisecond: number = setupOnceContext.awsContext.getRemainingTimeInMillis() as number;
      const executionTime: number = setupOnceContext.configuredTimeInMilliseconds - remainingTimeInMillisecond;

      scope.setContext('Memory usage and execution duration', {
        'Execution duration in millis': executionTime,
        'Memory usage in MB': getMemoryUsage(),
        'Remaining time in millis': setupOnceContext.awsContext.getRemainingTimeInMillis(),
      });
    }

    /**
     * This function sets Additional Lambda Parameters which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     */
    function setAdditionalLambdaParameters(scope: Scope): void {
      scope.setExtra('lambda', {
        aws_request_id: setupOnceContext.awsContext.awsRequestId,
        function_name: setupOnceContext.awsContext.functionName,
        function_version: setupOnceContext.awsContext.functionVersion,
        invoked_function_arn: setupOnceContext.awsContext.invokedFunctionArn,
      });
    }

    /**
     * This function sets Cloud Watch Logs data which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     */
    function setCloudwatchLogsData(scope: Scope): void {
      scope.setExtra('cloudwatch logs', {
        log_group: setupOnceContext.awsContext.logGroupName,
        log_stream: setupOnceContext.awsContext.logStreamName,
        /**
         * process.env.AWS_REGION -  this parameters given the AWS region
         * process.env.AWS_LAMBDA_FUNCTION_NAME - this parameter provides the AWS Lambda Function name
         */
        url: `https://${process.env.AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${process.env.AWS_LAMBDA_FUNCTION_NAME}`,
      });
    }

    /**
     * This function sets tags which are displayed in Sentry Dashboard
     * @param scope  - holds additional event information
     */
    function setTags(scope: Scope): void {
      scope.setTag('runtime', `${nodeJs} ${global.process.version}`);
      scope.setTag('transaction', setupOnceContext.awsContext.functionName);
      scope.setTag('runtime.name', nodeJs);
      scope.setTag('server_name', String(process.env._AWS_XRAY_DAEMON_ADDRESS));
      scope.setTag('url', 'awslambda:///' + setupOnceContext.awsContext.functionName);
    }

    /**
     * unhandled and handled exception
     * @param error  - holds the error captured in AWS Lambda Function
     * @param id  - holds event id value
     * @param callback  - callback function
     */
    rapidRuntime.prototype.postInvocationError = function (error: Error, id: string, callback: () => void): void {
      if (hub && hub.getIntegration(AWSLambda)) {
        hub.withScope((scope: Scope) => {
          scope.addEventProcessor((event) => {
            if (getCurrentHub().getIntegration(AWSLambda)) {
              event.event_id = id.toString();
            }
            return event;
          });
        });
      }

      /**
       * setting parameters in scope which will be displayed as additional data in Sentry dashboard
       * @param scope  - holds additional event information
       */
      hub.configureScope((scope: Scope) => {
        // tags
        setTags(scope);
        // memory usage and execution time
        setMemoryUsageAndExecutionTime(scope);
        // runtime
        setAdditionalRuntimeData(scope);
        // setting the lambda parameters
        setAdditionalLambdaParameters(scope);
        // setting the cloudwatch logs parameter
        setCloudwatchLogsData(scope);
        // setting the sys.argv parameter
        scope.setExtra('sys.argv', process.argv);
      });

      /** capturing the exception and re-directing it to the Sentry Dashboard */
      hub.captureException(error);

      /**
       * Here, we make sure the error has been captured by Sentry Dashboard
       * and then re-raised the exception
       */
      setTimeout(() => {
        // re-raising the exception so as to capture it as an event.
        invokedFunction.call(this, error, id, callback);
      }, 1000);
    };
  }
}
