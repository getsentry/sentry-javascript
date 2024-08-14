import { simulateCLS } from '../../../../utils/web-vitals/cls.ts';

// Simulate Layout shift right at the beginning of the page load, depending on the URL hash
// don't run if expected CLS is NaN
const expectedCLS = Number(location.hash.slice(1));
if (expectedCLS && expectedCLS >= 0) {
  simulateCLS(expectedCLS).then(() => window.dispatchEvent(new Event('cls-done')));
}

// Simulate layout shift whenever the trigger-cls event is dispatched
// Cannot trigger cia a button click because expected layout shift after
// an interaction doesn't contribute to CLS.
window.addEventListener('trigger-cls', () => {
  simulateCLS(0.1).then(() => {
    window.dispatchEvent(new Event('cls-done'));
  });
});
