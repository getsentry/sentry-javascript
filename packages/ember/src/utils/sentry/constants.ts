/**
 * Inline script for marking initial load end time.
 * Add this in a `<script>` tag at the end of `<body>` in your index.html
 * for accurate initial load measurement.
 *
 * If using CSP, add `'sha256-${INITIAL_LOAD_BODY_SCRIPT_HASH}'` to your script-src directive.
 */
export const INITIAL_LOAD_BODY_SCRIPT =
  "if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-end');}";

/**
 * SHA-256 hash of INITIAL_LOAD_BODY_SCRIPT for CSP script-src directive.
 * Use as: `script-src 'sha256-jax2B81eAvYZMwpds3uZwJJOraCENeDFUJKuNJau/bg=' ...`
 */
export const INITIAL_LOAD_BODY_SCRIPT_HASH =
  'jax2B81eAvYZMwpds3uZwJJOraCENeDFUJKuNJau/bg=';

/**
 * Inline script for marking initial load start time.
 * Add this in a `<script>` tag at the start of `<head>` in your index.html
 * for accurate initial load measurement.
 *
 * If using CSP, add `'sha256-${INITIAL_LOAD_HEAD_SCRIPT_HASH}'` to your script-src directive.
 */
export const INITIAL_LOAD_HEAD_SCRIPT =
  "if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-start');}";

/**
 * SHA-256 hash of INITIAL_LOAD_HEAD_SCRIPT for CSP script-src directive.
 * Use as: `script-src 'sha256-rK59cvsWB8z8eOLy4JAib4tBp8c/beXTnlIRV+lYjhg=' ...`
 */
export const INITIAL_LOAD_HEAD_SCRIPT_HASH =
  'rK59cvsWB8z8eOLy4JAib4tBp8c/beXTnlIRV+lYjhg=';
