/**
 * Simulate an old pre v8 SDK obtaining the hub from the global sentry carrier
 * and checking for the hub version.
 */
const res = window && window.__SENTRY__ && window.__SENTRY__.hub && window.__SENTRY__.hub.isOlderThan(7);

// Write back result into the document
document.getElementById('olderThan').innerText = res;
