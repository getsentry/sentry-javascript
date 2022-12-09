import type { BaseTransportOptions, ClientOptions, Hub, Transaction, TransactionMetadata } from '@sentry/types';

import { importCppBindingsModule } from './cpu_profiler';
import { __PRIVATE__wrapStartTransactionWithProfiling } from './hubextensions';

const profiler = importCppBindingsModule();

function makeTransactionMock(): Transaction {
  return {
    metadata: {},
    tags: {},
    startChild: () => ({ finish: () => void 0 }),
    finish() {
      return;
    },
    setTag(key: string, value: any) {
      this.tags[key] = value;
    },
    setMetadata(metadata: Partial<TransactionMetadata>) {
      this.metadata = { ...metadata } as TransactionMetadata;
    },
  } as Transaction;
}

function makeHubMock({ profilesSampleRate }: { profilesSampleRate: number | undefined }): Hub {
  return {
    getClient: jest.fn().mockImplementation(() => {
      return {
        getOptions: jest.fn().mockImplementation(() => {
          return {
            profilesSampleRate,
          } as unknown as ClientOptions<BaseTransportOptions>;
        }),
      };
    }),
  } as unknown as Hub;
}

describe('hubextensions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });
  it('skips profiling if profilesSampleRate is not set (undefined)', () => {
    const hub = makeHubMock({ profilesSampleRate: undefined });
    const startTransaction = jest.fn().mockImplementation(() => makeTransactionMock());
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');

    const maybeStartTransactionWithProfiling = __PRIVATE__wrapStartTransactionWithProfiling(startTransaction);
    const transaction = maybeStartTransactionWithProfiling.call(hub, { name: '' }, {});
    transaction.finish();

    expect(startTransaction).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).not.toHaveBeenCalled();
    expect(transaction.metadata?.profile).toBeUndefined();
  });
  it('skips profiling if profilesSampleRate is set to 0', () => {
    const hub = makeHubMock({ profilesSampleRate: 0 });
    const startTransaction = jest.fn().mockImplementation(() => makeTransactionMock());
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');

    const maybeStartTransactionWithProfiling = __PRIVATE__wrapStartTransactionWithProfiling(startTransaction);
    const transaction = maybeStartTransactionWithProfiling.call(hub, { name: '' }, {});
    transaction.finish();

    expect(startTransaction).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).not.toHaveBeenCalled();
    expect(transaction.metadata?.profile).toBeUndefined();
  });
  it('skips profiling when random > sampleRate', () => {
    const hub = makeHubMock({ profilesSampleRate: 0.5 });
    jest.spyOn(global.Math, 'random').mockReturnValue(1);
    const startTransaction = jest.fn().mockImplementation(() => makeTransactionMock());
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');

    const maybeStartTransactionWithProfiling = __PRIVATE__wrapStartTransactionWithProfiling(startTransaction);
    const transaction = maybeStartTransactionWithProfiling.call(hub, { name: '' }, {});
    transaction.finish();

    expect(startTransaction).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).not.toHaveBeenCalled();
    expect(transaction.metadata?.profile).toBeUndefined();
  });
  it('starts the profiler', () => {
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(profiler, 'stopProfiling');

    const hub = makeHubMock({ profilesSampleRate: 1 });
    const startTransaction = jest.fn().mockImplementation(() => makeTransactionMock());

    const maybeStartTransactionWithProfiling = __PRIVATE__wrapStartTransactionWithProfiling(startTransaction);
    const transaction = maybeStartTransactionWithProfiling.call(hub, { name: '' }, {});
    transaction.finish();

    expect(startTransaction).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    expect(transaction.metadata?.profile).toBeDefined();
  });
});
