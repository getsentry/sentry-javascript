const oldOnError = window.onerror;

window.onerror = function () {
  console.log('custom error');
  oldOnError && oldOnError.apply(this, arguments);
};

window.doSomethingWrong();
