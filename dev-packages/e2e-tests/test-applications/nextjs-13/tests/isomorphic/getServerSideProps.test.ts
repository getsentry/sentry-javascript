import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should record performance for getServerSideProps', async ({ page }) => {
  const pageloadTransactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === '/[param]/withServerSideProps' &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  const serverTransactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /[param]/withServerSideProps' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  await page.goto(`/1337/withServerSideProps`);

  const pageloadTransaction = await pageloadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();

  await test.step('should propagate tracing data from server to client', async () => {
    const nextDataTag = await page.waitForSelector('#__NEXT_DATA__', { state: 'attached' });
    const nextDataTagValue = JSON.parse(await nextDataTag.evaluate(tag => (tag as HTMLElement).innerText));

    const traceId = pageloadTransaction?.contexts?.trace?.trace_id;

    expect(traceId).toBeDefined();

    expect(nextDataTagValue.props.pageProps.data).toBe('[some getServerSideProps data]');
    expect(nextDataTagValue.props.pageProps._sentryTraceData).toBeTruthy();
    expect(nextDataTagValue.props.pageProps._sentryBaggage).toBeTruthy();

    expect(nextDataTagValue.props.pageProps._sentryTraceData.split('-')[0]).toBe(traceId);

    expect(nextDataTagValue.props.pageProps._sentryBaggage.match(/sentry-trace_id=([a-f0-9]*),/)[1]).toBe(traceId);
  });

  await test.step('should record serverside performance', async () => {
    expect(await serverTransactionPromise).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
        },
      },
      transaction: 'GET /[param]/withServerSideProps',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
      request: {
        url: expect.stringMatching(/http.*\/1337\/withServerSideProps$/),
      },
    });
  });
});
