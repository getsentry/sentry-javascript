/**
 * Helper to wait for an XHR to finish
 *
 * @param {{ readyState: number }} xhr
 * @param {() => unknown} cb
 * @returns {*}  {unknown}
 */
export function waitForXHR(xhr: { readyState: number }, cb: () => unknown): unknown {
  if (xhr.readyState === XMLHttpRequest.DONE) {
    return cb();
  }

  setTimeout(function() {
    waitForXHR(xhr, cb);
  }, 1000 / 60);
}
