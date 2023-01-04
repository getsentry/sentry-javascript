import { createPerformanceEntries } from '../../src/createPerformanceEntry';

it('ignores sdks own requests', function () {
  const data = {
    name: 'https://ingest.f00.f00/api/1/envelope/?sentry_key=dsn&sentry_version=7',
    entryType: 'resource',
    startTime: 234462.69999998808,
    duration: 55.70000001788139,
    initiatorType: 'fetch',
    nextHopProtocol: '',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 234462.69999998808,
    domainLookupStart: 0,
    domainLookupEnd: 0,
    connectStart: 0,
    connectEnd: 0,
    secureConnectionStart: 0,
    requestStart: 0,
    responseStart: 0,
    responseEnd: 234518.40000000596,
    transferSize: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    serverTiming: [],
    workerTiming: [],
  } as const;

  // @ts-ignore Needs a PerformanceEntry mock
  expect(createPerformanceEntries([data])).toEqual([]);
});
