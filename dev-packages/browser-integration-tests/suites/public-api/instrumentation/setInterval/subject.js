let exceptionInterval = setInterval(function () {
  clearInterval(exceptionInterval);
  throw new Error('setInterval_error');
}, 0);
