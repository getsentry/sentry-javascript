export function PerformanceEntryLcp(obj?: Partial<PerformancePaintTiming>): PerformancePaintTiming {
  const entry = {
    name: '',
    entryType: 'largest-contentful-paint',
    startTime: 108.299,
    duration: 0,
    size: 7619,
    renderTime: 108.299,
    loadTime: 0,
    firstAnimatedFrameTime: 0,
    id: '',
    url: '',
    ...obj,

    toJSON: () => entry,
  };

  return entry;
}
