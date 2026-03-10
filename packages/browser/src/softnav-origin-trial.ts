/**
 * Self-executing script that registers a third-party origin trial token
 * for Chrome's Soft Navigation API.
 *
 * This script should be loaded via a <script> tag from the Sentry CDN.
 * The origin trial token is bound to the CDN origin, enabling the
 * Soft Navigation API on the host page without requiring customers
 * to register their own origin trial.
 *
 * Usage:
 *   <script src="https://browser.sentry-cdn.com/{version}/softnav-origin-trial.min.js"></script>
 */

// Third-party origin trial token for SoftNavigationHeuristics, registered for browser.sentry-cdn.com
// Expires: 2026-03-07 (renew at https://developer.chrome.com/origintrials/)
const SOFT_NAV_ORIGIN_TRIAL_TOKEN =
  'A3dctl5Dlw3FYmgyjr6G80iHiT+Q/t/qGInJZPwCyz2eKIi6HwZjMTGBE1RtHfb3C2kWbs2D8qqHhCfspxkqDAAAAAB8eyJvcmlnaW4iOiJodHRwczovL2Jyb3dzZXIuc2VudHJ5LWNkbi5jb206NDQzIiwiZmVhdHVyZSI6IlNvZnROYXZpZ2F0aW9uSGV1cmlzdGljcyIsImV4cGlyeSI6MTc3MzEwMDgwMCwiaXNUaGlyZFBhcnR5Ijp0cnVlfQ==';

(function () {
  try {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'origin-trial';
    meta.content = SOFT_NAV_ORIGIN_TRIAL_TOKEN;
    document.head.appendChild(meta);
  } catch {
    // Silently fail if document/head is not available
  }
})();
