export {
  addPerformanceInstrumentationHandler,
  addClsInstrumentationHandler,
  addTtfbInstrumentationHandler,
  addLcpInstrumentationHandler,
  addInpInstrumentationHandler,
} from './instrumentation/performanceObserver';

export { addPerformanceEntries, startTrackingLongTasks, startTrackingLongAnimationFrames } from './performance/entries';

export {
  addWebVitalsToSpan,
  // eslint-disable-next-line typescript/no-deprecated
  startTrackingWebVitals,
  registerInpInteractionListener,
} from './web-vitals/tracking';

// eslint-disable-next-line typescript/no-deprecated
export { elementTimingIntegration, startTrackingElementTiming } from './performance/elementTiming';

export { interactionsIntegration } from './performance/interactions';

export { userTimingIntegration } from './performance/userTiming';

export { extractNetworkProtocol } from './performance/utils';

export { trackClsAsSpan, trackInpAsSpan, trackLcpAsSpan } from './web-vitals/spans';

export { whenIdleOrHidden } from './web-vitals/utils';

export { addClickKeypressInstrumentationHandler } from './instrumentation/dom';

export { addHistoryInstrumentationHandler } from './instrumentation/history';

export { fetch, setTimeout, clearCachedImplementation, getNativeImplementation } from './getNativeImplementation';

export { addXhrInstrumentationHandler, SENTRY_XHR_DATA_KEY } from './instrumentation/xhr';

export { getBodyString, getFetchRequestArgBody, serializeFormData, parseXhrResponseHeaders } from './networkUtils';

export { resourceTimingToSpanAttributes } from './performance/resourceTiming';

export { htmlTreeAsString } from './htmlTreeAsString';

export { isElement } from './is';

export { getAbsoluteUrl } from './instrumentation/location';

export type { FetchHint, NetworkMetaWarning, XhrHint } from './types';
