// Called from a served script so the synthetic stacktrace keeps a frame with a URL. Frames from
// `page.evaluate` have none, and the SDK's own `captureMessage` frames are stripped.
window.captureTestMessage = () => {
  window.Sentry.captureMessage('Some message');
};
