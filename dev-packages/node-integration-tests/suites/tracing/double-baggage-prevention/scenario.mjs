import * as Sentry from '@sentry/node';
import http from 'http';

let capturedHeaders = {};
const targetServer = http.createServer((req, res) => {
  capturedHeaders = {
    'sentry-trace': req.headers['sentry-trace'],
    baggage: req.headers['baggage'],
  };
  res.writeHead(200);
  res.end('ok');
});

targetServer.listen(0, async () => {
  const targetPort = targetServer.address().port;
  const targetUrl = `http://localhost:${targetPort}/target`;

  try {
    // Step 1: fetch with manual getTraceData() headers
    capturedHeaders = {};
    await fetch(targetUrl, { headers: { ...Sentry.getTraceData() } });
    const fetchHeaders1 = { ...capturedHeaders };

    // Step 2: fetch without manual headers
    capturedHeaders = {};
    await fetch(targetUrl);
    const fetchHeaders2 = { ...capturedHeaders };

    // Step 3: http.request with manual getTraceData() headers
    capturedHeaders = {};
    await new Promise((resolve, reject) => {
      const traceData = Sentry.getTraceData();
      const req = http.request(
        {
          hostname: 'localhost',
          port: targetPort,
          path: '/target',
          method: 'GET',
          headers: traceData,
        },
        res => {
          res.on('data', () => { });
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.end();
    });
    const httpHeaders = { ...capturedHeaders };

    // Step 4: fetch with custom + manual sentry baggage
    capturedHeaders = {};
    const traceData = Sentry.getTraceData();
    await fetch(targetUrl, {
      headers: {
        ...traceData,
        baggage: `custom-key=value,${traceData.baggage}`,
      },
    });
    const fetchHeaders4 = { ...capturedHeaders };

    const results = {
      test1: {
        sentryTrace: fetchHeaders1['sentry-trace'],
        baggage: fetchHeaders1.baggage,
        hasDuplicateSentryTrace: fetchHeaders1['sentry-trace']?.includes(','),
        sentryBaggageCount: (fetchHeaders1.baggage?.match(/sentry-/g) || []).length,
      },
      test2: {
        sentryTrace: fetchHeaders2['sentry-trace'],
        baggage: fetchHeaders2.baggage,
        hasDuplicateSentryTrace: fetchHeaders2['sentry-trace']?.includes(','),
        sentryBaggageCount: (fetchHeaders2.baggage?.match(/sentry-/g) || []).length,
      },
      test3: {
        sentryTrace: httpHeaders['sentry-trace'],
        baggage: httpHeaders.baggage,
        hasDuplicateSentryTrace: httpHeaders['sentry-trace']?.includes(','),
        sentryBaggageCount: (httpHeaders.baggage?.match(/sentry-/g) || []).length,
      },
      test4: {
        sentryTrace: fetchHeaders4['sentry-trace'],
        baggage: fetchHeaders4.baggage,
        hasDuplicateSentryTrace: fetchHeaders4['sentry-trace']?.includes(','),
        hasCustomBaggage: fetchHeaders4.baggage?.includes('custom-key=value'),
        sentryBaggageCount: (fetchHeaders4.baggage?.match(/sentry-/g) || []).length,
      },
    };

  } catch (error) {
    throw error;
  } finally {
    targetServer.close();
  }
});
