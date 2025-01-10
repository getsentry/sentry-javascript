const sentryCarrier = window?.__SENTRY__;

/**
 * Simulate an old pre v8 SDK obtaining the hub from the global sentry carrier
 * and checking for the hub version.
 */
const res = sentryCarrier.hub?.isOlderThan(7);

// Write back result into the document
document.getElementById('olderThan').innerText = res;
