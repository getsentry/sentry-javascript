'use strict';

function run(n) {
  if (n == null) return run(1000);
  if (n === 0) throw new Error('we did it!');
  console.log('run ' + n);
  return run(n - 1);
}

module.exports.run = run;

// below is 5MB worth of 'A', so reading this file multiple times concurrently will use lots of memory
var a = '{{template}}';
