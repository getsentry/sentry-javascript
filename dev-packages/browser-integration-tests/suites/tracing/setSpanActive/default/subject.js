const checkoutSpan = Sentry.startInactiveSpan({ name: 'checkout-flow' });
Sentry.setSpanActive(checkoutSpan);

Sentry.startSpan({ name: 'checkout-step-1' }, () => {
  Sentry.startSpan({ name: 'checkout-step-1-1' }, () => {
    // ... `
  });
});

Sentry.startSpan({ name: 'checkout-step-2' }, () => {
  // ... `
});

checkoutSpan.end();
