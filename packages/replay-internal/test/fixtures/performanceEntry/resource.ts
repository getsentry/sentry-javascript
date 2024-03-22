export function PerformanceEntryResource(obj?: Partial<PerformanceResourceTiming>): PerformanceResourceTiming {
  const entry = {
    name: 'https://dev.getsentry.net:7999/_assets/sentry.js',
    entryType: 'resource',
    startTime: 0,
    duration: 101.90000003576279,
    initiatorType: 'script',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 325.19999998807907,
    domainLookupStart: 325.19999998807907,
    domainLookupEnd: 325.19999998807907,
    connectStart: 325.19999998807907,
    connectEnd: 325.19999998807907,
    secureConnectionStart: 325.19999998807907,
    requestStart: 394.19999998807907,
    responseStart: 399.69999998807907,
    responseEnd: 427.10000002384186,
    transferSize: 287606,
    encodedBodySize: 287306,
    decodedBodySize: 1190668,
    serverTiming: [],
    ...obj,

    toJSON: () => entry,
  };

  return entry;
}
