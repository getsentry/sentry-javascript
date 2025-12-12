// Based on possible TypeError exceptions from https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch

// Network error (e.g. ad-blocked, offline, page does not exist, ...)
window.networkError = () => {
  fetch('http://sentry-test-external.io/does-not-exist');
};

window.networkErrorSubdomain = () => {
  fetch('http://subdomain.sentry-test-external.io/does-not-exist');
};

window.networkErrorWithPort = () => {
  fetch('http://sentry-test-external.io:3000/does-not-exist');
};

// Invalid header also produces TypeError
window.invalidHeaderName = () => {
  fetch('http://sentry-test-external.io/invalid-header-name', { headers: { 'C ontent-Type': 'text/xml' } });
};

// Invalid header value also produces TypeError
window.invalidHeaderValue = () => {
  fetch('http://sentry-test-external.io/invalid-header-value', { headers: ['Content-Type', 'text/html', 'extra'] });
};

// Invalid URL scheme
window.invalidUrlScheme = () => {
  fetch('blub://sentry-test-external.io/invalid-scheme');
};

// URL includes credentials
window.credentialsInUrl = () => {
  fetch('https://user:password@sentry-test-external.io/credentials-in-url');
};

// Invalid mode
window.invalidMode = () => {
  fetch('https://sentry-test-external.io/invalid-mode', { mode: 'navigate' });
};

// Invalid request method
window.invalidMethod = () => {
  fetch('http://sentry-test-external.io/invalid-method', { method: 'CONNECT' });
};

// No-cors mode with cors-required method
window.noCorsMethod = () => {
  fetch('http://sentry-test-external.io/no-cors-method', { mode: 'no-cors', method: 'PUT' });
};
