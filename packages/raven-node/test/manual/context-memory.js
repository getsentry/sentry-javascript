'use strict';
var Raven = require('../../');
Raven.config('https://public:private@app.getsentry.com/12345').install();

// We create a bunch of contexts, capture some breadcrumb data in all of them,
// then watch memory usage. It'll go up to ~40 megs then after 10 or 20 seconds
// gc will drop it back to ~5.

console.log(process.memoryUsage());
for (var i = 0; i < 10000; i++) {
  Raven.context(function () {
    Raven.captureBreadcrumb({ message: Array(1000).join('.') });
    setTimeout(function () {
      Raven.captureBreadcrumb({ message: Array(1000).join('a') });
    }, 2000);
  });
}

console.log(process.memoryUsage());
setInterval(function () {
  console.log(process.memoryUsage());
}, 1000);
