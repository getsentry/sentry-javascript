import { getActiveSpan, spanToJSON, startSpan } from '@sentry/browser';

const waitForSeconds = seconds => new Promise(res => setTimeout(res, seconds * 1000));

startSpan({ name: 'span 1' }, async () => {
  await waitForSeconds(1);
  window.firstWaitingSpan = spanToJSON(getActiveSpan());
});

startSpan({ name: 'span 2' }, async () => {
  await waitForSeconds(2);
  window.secondWaitingSpan = spanToJSON(getActiveSpan());
});

startSpan({ name: 'span 3' }, async () => {
  await waitForSeconds(0.5);
  window.thirdWaitingSpan = spanToJSON(getActiveSpan());
});

/**
 * This is what happens here:
 * 1. span 1 starts
 * 2. span 2 starts
 * 3. span 3 starts (span 3 is active now)
 * 4. waiting time in span 3 is over and 'span 3' is stored in variable
 * 5. span 3 ends (2 is active now)
 * 6. waiting time in span 1 is over and 'span 2' is stored in variable
 * 7. span 2 ends (1 is active now)
 * 8. waiting time in span 2 is over and 'span 1' is stored in variable
 */
