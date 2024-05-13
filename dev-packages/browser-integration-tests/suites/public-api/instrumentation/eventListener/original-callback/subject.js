const div = document.createElement('div');
document.body.appendChild(div);
window.capturedCall = false;
const captureFn = function () {
  window.capturedCall = true;
};
// Use original addEventListener to simulate non-wrapped behavior (callback is attached without __sentry_wrapped__)
window.originalBuiltIns.addEventListener.call(div, 'click', captureFn);
// Then attach the same callback again, but with already wrapped method
div.addEventListener('click', captureFn);
div.removeEventListener('click', captureFn);
div.dispatchEvent(new MouseEvent('click'));
