import { getSentrySpan } from './spanprocessor';

export { SentrySpanProcessor } from './spanprocessor';
export { SentryPropagator } from './propagator';

/* eslint-disable deprecation/deprecation */
export { addOtelSpanData, getOtelSpanData, clearOtelSpanData } from './utils/spanData';
export type { AdditionalOtelSpanData } from './utils/spanData';
/* eslint-enable deprecation/deprecation */

/**
 * This is only exported for internal use.
 * Semver etc. does not apply here, this is subject to change at any time!
 * This is explicitly _NOT_ public because we may have to change the underlying way we store/handle spans,
 * which may make this API unusable without further notice.
 *
 * @private
 */
export { getSentrySpan as _INTERNAL_getSentrySpan };
