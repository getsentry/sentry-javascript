const Sentry = require('@sentry/node');
require('@sentry/tracing');
const { ProfilingIntegration } = require('./../../../../../lib/');

function isNotTransaction(span) {
  return span.op !== 'jest test';
}

function createProfiledEnvironmentEnvironment() {
  const BaseEnvironment = require('jest-environment-node').default;

  return class SentryEnvironment extends BaseEnvironment {
    constructor(...args) {
      super(...args);

      const [config, context] = args;

      this.Sentry = Sentry;
      this.Sentry.init({
        debug: true,
        dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
        integrations: [new ProfilingIntegration()],
        tracesSampleRate: 1,
        profilesSampleRate: 1
      });

      this.testPath = context.testPath.replace(process.cwd(), '');

      this.runDescribe = new Map();
      this.testContainers = new Map();
      this.tests = new Map();
      this.hooks = new Map();
    }

    async setup() {
      if (!this.Sentry || !this.options) {
        await super.setup();
        return;
      }

      this.transaction = this.Sentry.startTransaction({
        op: 'jest test suite',
        description: this.testPath,
        name: this.testPath
      });

      this.global.transaction = this.transaction;
      this.global.Sentry = this.Sentry;

      this.Sentry.configureScope((scope) => scope.setSpan(this.transaction));

      const span = this.transaction.startChild({
        op: 'setup',
        description: this.testPath
      });
      await super.setup();
      span.finish();
    }

    async teardown() {
      if (this.transaction) {
        const span = this.transaction.startChild({
          op: 'teardown',
          description: this.testPath
        });
        await super.teardown();
        span.finish();
      }
      if (this.transaction) {
        this.transaction.finish();
      }
    }

    getVmContext() {
      if (this.transaction && !this.getVmContextSpan) {
        this.getVmContextSpan = this.transaction.startChild({
          op: 'getVmContext'
        });
      }
      return super.getVmContext();
    }

    getName(parent) {
      if (!parent) {
        return '';
      }

      // Ignore these for now as it adds a level of nesting and I'm not quite sure where it's even coming from
      if (parent.name === 'ROOT_DESCRIBE_BLOCK') {
        return '';
      }

      const parentName = this.getName(parent.parent);
      return `${parentName ? `${parentName} >` : ''} ${parent.name}`;
    }

    getData({ name, ...event }) {
      switch (name) {
        case 'run_describe_start':
        case 'run_describe_finish':
          if (this.getVmContextSpan) {
            this.getVmContextSpan.finish();
            this.getVmContextSpan = null;
          }

          return {
            op: 'describe',
            obj: event.describeBlock,
            parentObj: event.describeBlock.parent,
            dataStore: this.runDescribe,
            parentStore: this.runDescribe
          };

        case 'test_start':
        case 'test_done':
          return {
            op: 'test',
            obj: event.test,
            parentObj: event.test.parent,
            dataStore: this.testContainers,
            parentStore: this.runDescribe,
            beforeFinish: (span) => {
              span.setStatus(!event.test.errors.length ? 'ok' : 'internal_error');
              return span;
            }
          };

        case 'test_fn_start':
        case 'test_fn_success':
        case 'test_fn_failure':
          return {
            op: 'test-fn',
            obj: event.test,
            parentObj: event.test,
            dataStore: this.tests,
            parentStore: this.testContainers,
            beforeFinish: (span) => {
              span.setStatus(!event.test.errors.length ? 'ok' : 'internal_error');
              return span;
            }
          };

        case 'hook_start':
          return {
            obj: event.hook.parent,
            op: event.hook.type,
            dataStore: this.hooks
          };

        case 'hook_success':
        case 'hook_failure':
          return {
            obj: event.hook.parent,
            parentObj: event.test && event.test.parent,
            dataStore: this.hooks,
            parentStore: this.testContainers,
            beforeFinish: (span) => {
              const parent = this.testContainers.get(this.getName(event.test));
              if (parent && !Array.isArray(parent)) {
                return parent.startChild(span);
              } else if (Array.isArray(parent)) {
                return parent.find(isNotTransaction).startChild(span);
              }
              return span;
            }
          };

        case 'start_describe_definition':
        case 'finish_describe_definition':
        case 'add_test':
        case 'add_hook':
        case 'run_start':
        case 'run_finish':
        case 'test_todo':
        case 'setup':
        case 'teardown':
          return null;

        default:
          return null;
      }
    }

    handleTestEvent(event) {
      if (!this.Sentry) {
        return;
      }

      const data = this.getData(event);
      const { name } = event;

      if (!data) {
        return;
      }

      const { obj, op, dataStore, beforeFinish } = data;
      const testName = this.getName(obj);

      if (name.includes('start') && op === 'test') {
        // Make this an option maybe
        if (!testName) {
          return;
        }

        // If we are starting a test, let's also make it a transaction so we can see our slowest tests
        const testTransaction = this.Sentry.startTransaction({
          name: testName,
          op: 'jest test'
        });

        // ensure that the test transaction is on the scope while it's happening

        dataStore.set(testName, testTransaction);
        return;
      }

      if (dataStore.has(testName) && beforeFinish) {
        const transaction = dataStore.get(testName);
        const testTransaction = beforeFinish(transaction);
        testTransaction.finish();
      }
    }
  };
}

module.exports = createProfiledEnvironmentEnvironment();
