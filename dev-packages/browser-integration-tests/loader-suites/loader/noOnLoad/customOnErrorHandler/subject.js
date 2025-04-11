const oldOnError = window.onerror;

window.onerror = function () {
  console.log('custom error');
  oldOnError?.apply(this, arguments);
};

window.doSomethingWrong();
