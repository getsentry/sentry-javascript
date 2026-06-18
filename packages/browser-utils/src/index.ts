export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addTtfbInstrumentationHandler,
  addLcpInstrumentationHandler,
  addInpInstrumentationHandler,
} from './metrics/instrument';

export {
  addPerformanceEntries,
  addWebVitalsToSpan,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingLongAnimationFrames,
  // eslint-disable-next-line typescript/no-deprecated
  startTrackingWebVitals,
  startTrackingINP,
  registerInpInteractionListener,
} from './metrics/browserMetrics';

// eslint-disable-next-line typescript/no-deprecated
export { elementTimingIntegration, startTrackingElementTiming } from './metrics/elementTiming';

export { extractNetworkProtocol } from './metrics/utils';

export { trackClsAsSpan, trackInpAsSpan, trackLcpAsSpan } from './metrics/webVitalSpans';

export { addClickKeypressInstrumentationHandler } from './instrument/dom';

export { addHistoryInstrumentationHandler } from './instrument/history';

export { fetch, setTimeout, clearCachedImplementation, getNativeImplementation } from './getNativeImplementation';

export { addXhrInstrumentationHandler, SENTRY_XHR_DATA_KEY } from './instrument/xhr';

export { getBodyString, getFetchRequestArgBody, serializeFormData, parseXhrResponseHeaders } from './networkUtils';

export { resourceTimingToSpanAttributes } from './metrics/resourceTiming';

export { htmlTreeAsString } from './htmlTreeAsString';

export { isElement } from './is';

export type { FetchHint, NetworkMetaWarning, XhrHint } from './types';
