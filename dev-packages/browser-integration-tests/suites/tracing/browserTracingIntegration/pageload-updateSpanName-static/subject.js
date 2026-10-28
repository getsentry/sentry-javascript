const activeSpan = Sentry.getActiveSpan();
const rootSpan = activeSpan && Sentry.getRootSpan(activeSpan);

Sentry.updateSpanName(rootSpan, 'new name');
