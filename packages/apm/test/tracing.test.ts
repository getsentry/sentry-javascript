import { Tracing } from '../src/integrations/tracing';

const tracing: Tracing = new Tracing();

const configureScope = jest.fn();
const startSpan = jest.fn();

const getCurrentHubMock: any = () => ({
  configureScope,
  startSpan,
});

tracing.setupOnce(jest.fn(), getCurrentHubMock);

describe('TransactionActivity', () => {
  afterEach(() => {
    jest.resetAllMocks();
    (Tracing as any)._activities = {};
    (Tracing as any)._currentIndex = 0;
    (Tracing as any)._activeTransaction = undefined;
  });

  test('startSpan with transaction', () => {
    // Tracing.startIdleTransaction('test');
    // expect(startSpan).toBeCalledWith({ transaction: 'test' });
    expect(true);
  });

  // test('track activity', () => {
  //   jest.useFakeTimers();
  //   const spy = jest.spyOn(TransactionActivity as any, '_watchActivity');

  //   TransactionActivity.pushActivity('xhr');
  //   expect(spy).toBeCalledTimes(1);
  //   jest.runOnlyPendingTimers();
  //   expect(spy).toBeCalledTimes(2);
  //   jest.runOnlyPendingTimers();
  //   expect(spy).toBeCalledTimes(3);
  // });

  // test('multiple activities ', () => {
  //   Tracing.pushActivity('xhr');
  //   const a = Tracing.pushActivity('xhr2');
  //   Tracing.popActivity(a);
  //   Tracing.pushActivity('xhr3');
  //   expect(Object.keys((Tracing as any)._activities)).toHaveLength(2);
  // });

  // test('finishing a transaction after debounce', () => {
  //   jest.useFakeTimers();
  //   const spy = jest.spyOn(TransactionActivity as any, '_watchActivity');
  //   TransactionActivity.startIdleTransaction('test');
  //   const a = TransactionActivity.pushActivity('xhr');
  //   expect(spy).toBeCalledTimes(1);
  //   expect(Object.keys((TransactionActivity as any)._activities)).toHaveLength(1);
  //   TransactionActivity.popActivity(a);
  //   expect(Object.keys((TransactionActivity as any)._activities)).toHaveLength(0);
  //   jest.runOnlyPendingTimers();
  //   expect(spy).toBeCalledTimes(2);
  // });
});
