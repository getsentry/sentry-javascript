function run() {
  Sentry.startSpan({ name: 'parent_span' }, () => {
    throw new Error('Sync Error');
  });
}

// using `setTimeout` here because otherwise the thrown error will be
// thrown as a generic "Script Error." instead of the actual error".
setTimeout(run);
