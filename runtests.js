#!/usr/bin/env node

/**
 * Module dependencies.
 */

var Canvas = require('term-canvas')
  , size = process.stdout.getWindowSize()
  , Cloud = require('mocha-cloud')
  , GridView = require('mocha-cloud-grid-view');

var cloud = new Cloud('raven-js', 'raven-js', 'b39f5c10-ec75-40ce-8ca3-56727f2901f3');

// the browsers to test

//cloud.browser('internet explorer', '10', 'Windows 2012');
//cloud.browser('internet explorer', '9', 'Windows 2008');
// cloud.browser('internet explorer', '8', 'Windows 2003');
// cloud.browser('internet explorer', '7', 'Windows 2003');
// cloud.browser('internet explorer', '8', 'Windows 2003');
// cloud.browser('iphone', '5.0', 'Mac 10.6');
// cloud.browser('iphone', '5.1', 'Mac 10.8');
// cloud.browser('iphone', '6', 'Mac 10.8');
// cloud.browser('ipad', '5.1', 'Mac 10.8');
// cloud.browser('ipad', '6', 'Mac 10.8');
// cloud.browser('safari', '5', 'Mac 10.6');
// cloud.browser('safari', '6', 'Mac 10.8');
cloud.browser('chrome', '', 'Mac 10.8');
// cloud.browser('firefox', '15', 'Windows 2003');
// cloud.browser('firefox', '16', 'Windows 2003');
cloud.browser('firefox', '17', 'Windows 2003');

// the local url to test

cloud.url('http://localhost:8888/test/test.html');

// setup

var canvas = new Canvas(size[0], size[1]);
var ctx = canvas.getContext('2d');
var grid = new GridView(cloud, ctx);
grid.size(canvas.width, canvas.height);
ctx.hideCursor();

// trap SIGINT

process.on('SIGINT', function(){
  ctx.reset();
  process.nextTick(function(){
    process.exit();
  });
});

// output failure messages
// once complete, and exit > 0
// accordingly
cloud.start(function(){
  grid.showFailures();
  setTimeout(function(){
    ctx.showCursor();
    process.exit(grid.totalFailures());
  }, 100);
});


// cloud.on('init', function(browser){
  // console.log('  init : %s %s', browser.browserName, browser.version);
// });
// 
// cloud.on('start', function(browser){
  // console.log('  start : %s %s', browser.browserName, browser.version);
// });
// 
// cloud.on('end', function(browser, res){
  // console.log(res);
  // console.log('  end : %s %s : %d failures', browser.browserName, browser.version, res.failures);
// });
// 
// cloud.start();
// 
