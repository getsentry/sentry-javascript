import { TransactionActivity } from '../src/transactionactivity';

const transactionActivity: TransactionActivity = new TransactionActivity();

const configureScope: any = jest.fn();
const startSpan: any = jest.fn();

const getCurrentHubMock: any = () => ({
  configureScope,
  startSpan,
});

transactionActivity.setupOnce(jest.fn(), getCurrentHubMock);

describe('TransactionActivity', () => {
  afterEach(() => {
    jest.resetAllMocks();
    (TransactionActivity as any)._activities = {};
    (TransactionActivity as any)._currentIndex = 0;
    (TransactionActivity as any)._activeTransaction = undefined;
  });

  test('startSpan with transaction', () => {
    TransactionActivity.startIdleTransaction('test');
    expect(startSpan).toBeCalled();
    expect(startSpan.mock.calls[0][0].transaction).toBe('test');
  });

  test('track activity', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(TransactionActivity as any, '_watchActivity');

    TransactionActivity.pushActivity('xhr');
    expect(spy).toBeCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(spy).toBeCalledTimes(2);
    jest.runOnlyPendingTimers();
    expect(spy).toBeCalledTimes(3);
  });

  test('multiple activities ', () => {
    TransactionActivity.pushActivity('xhr');
    const a = TransactionActivity.pushActivity('xhr2');
    TransactionActivity.popActivity(a);
    TransactionActivity.pushActivity('xhr3');
    expect(Object.keys((TransactionActivity as any)._activities)).toHaveLength(2);
  });

  test.only('finishing a transaction after debounce', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(TransactionActivity as any, '_watchActivity');
    TransactionActivity.startIdleTransaction('test');
    const a = TransactionActivity.pushActivity('xhr');
    expect(spy).toBeCalledTimes(1);
    expect(Object.keys((TransactionActivity as any)._activities)).toHaveLength(1);
    TransactionActivity.popActivity(a);
    expect(Object.keys((TransactionActivity as any)._activities)).toHaveLength(0);
    jest.runOnlyPendingTimers();
    expect(spy).toBeCalledTimes(2);
    expect((TransactionActivity as any)._debounce).toBeTruthy();
  });
});
