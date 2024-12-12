/* eslint-disable deprecation/deprecation */
import { getCurrentScope, getIsolationScope, setCurrentClient } from '../../../src';
import { MetricsAggregator } from '../../../src/metrics/aggregator';
import { metrics as metricsCore } from '../../../src/metrics/exports';
import { metricsDefault } from '../../../src/metrics/exports-default';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

describe('metrics.timing', () => {
  let testClient: TestClient;
  const options = getDefaultTestClientOptions({
    dsn: PUBLIC_DSN,
    tracesSampleRate: 0.0,
  });

  beforeEach(() => {
    testClient = new TestClient(options);
    setCurrentClient(testClient);
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  it('works with minimal data', async () => {
    const res = metricsDefault.timing('t1', 10);
    expect(res).toStrictEqual(undefined);

    const sendSpy = jest.spyOn(testClient.getTransport()!, 'send');

    metricsCore.getMetricsAggregatorForClient(testClient, MetricsAggregator)!.flush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith([
      { sent_at: expect.any(String) },
      [[{ length: expect.any(Number), type: 'statsd' }, expect.stringMatching(/t1@second:10\|d\|T(\d+)/)]],
    ]);
  });

  it('allows to define a unit', async () => {
    const res = metricsDefault.timing('t1', 10, 'hour');
    expect(res).toStrictEqual(undefined);

    const sendSpy = jest.spyOn(testClient.getTransport()!, 'send');

    metricsCore.getMetricsAggregatorForClient(testClient, MetricsAggregator)!.flush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith([
      { sent_at: expect.any(String) },
      [[{ length: expect.any(Number), type: 'statsd' }, expect.stringMatching(/t1@hour:10\|d\|T(\d+)/)]],
    ]);
  });

  it('allows to define data', async () => {
    const res = metricsDefault.timing('t1', 10, 'hour', {
      tags: { tag1: 'value1', tag2: 'value2' },
    });
    expect(res).toStrictEqual(undefined);

    const sendSpy = jest.spyOn(testClient.getTransport()!, 'send');

    metricsCore.getMetricsAggregatorForClient(testClient, MetricsAggregator)!.flush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith([
      { sent_at: expect.any(String) },
      [
        [
          { length: expect.any(Number), type: 'statsd' },
          expect.stringMatching(/t1@hour:10\|d|#tag1:value1,tag2:value2\|T(\d+)/),
        ],
      ],
    ]);
  });

  it('works with a sync callback', async () => {
    const res = metricsDefault.timing('t1', () => {
      sleepSync(200);
      return 'oho';
    });
    expect(res).toStrictEqual('oho');

    const sendSpy = jest.spyOn(testClient.getTransport()!, 'send');

    metricsCore.getMetricsAggregatorForClient(testClient, MetricsAggregator)!.flush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith([
      { sent_at: expect.any(String) },
      [[{ length: expect.any(Number), type: 'statsd' }, expect.stringMatching(/t1@second:(0.\d+)\|d\|T(\d+)/)]],
    ]);
  });

  it('works with an async callback', async () => {
    const res = metricsDefault.timing('t1', async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return 'oho';
    });
    expect(res).toBeInstanceOf(Promise);
    expect(await res).toStrictEqual('oho');

    const sendSpy = jest.spyOn(testClient.getTransport()!, 'send');

    metricsCore.getMetricsAggregatorForClient(testClient, MetricsAggregator)!.flush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith([
      { sent_at: expect.any(String) },
      [[{ length: expect.any(Number), type: 'statsd' }, expect.stringMatching(/t1@second:(0.\d+)\|d\|T(\d+)/)]],
    ]);
  });
});

function sleepSync(milliseconds: number): void {
  const start = Date.now();
  for (let i = 0; i < 1e7; i++) {
    if (new Date().getTime() - start > milliseconds) {
      break;
    }
  }
}
