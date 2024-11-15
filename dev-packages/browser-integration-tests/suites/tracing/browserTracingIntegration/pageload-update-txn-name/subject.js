const activeSpan = Sentry.getActiveSpan();
const rootSpan = activeSpan && Sentry.getRootSpan(activeSpan);
rootSpan?.updateName('new name');
