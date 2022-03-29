// deactivate fetch s.t. the SDK falls back to XHR transport
window.fetch = undefined;

Sentry.captureException(new Error('this is an error'));
