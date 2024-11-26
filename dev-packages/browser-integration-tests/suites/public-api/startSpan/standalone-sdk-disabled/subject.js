Sentry.startSpan({ name: 'standalone_segment_span', experimental: { standalone: true } }, () => {});

window.spanEnded = true;
