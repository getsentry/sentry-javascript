const checkoutSpan = Sentry.startInactiveSpan({ name: 'checkout-flow' });
Sentry.setActiveSpanInBrowser(checkoutSpan);

Sentry.startSpan({ name: 'checkout-step-1' }, () => {});

const checkoutStep2 = Sentry.startInactiveSpan({ name: 'checkout-step-2' });
Sentry.setActiveSpanInBrowser(checkoutStep2);

Sentry.startSpan({ name: 'checkout-step-2-1' }, () => {
  // ... `
});
checkoutStep2.end();

Sentry.startSpan({ name: 'checkout-step-3' }, () => {});

checkoutSpan.end();

Sentry.startSpan({ name: 'post-checkout' }, () => {
  Sentry.startSpan({ name: 'post-checkout-1' }, () => {
    // ... `
  });
});
