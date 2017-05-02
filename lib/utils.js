'use strict';

var fs = require('fs');
var url = require('url');
var transports = require('./transports');
var path = require('path');
var lsmod = require('lsmod');
var stacktrace = require('stack-trace');

var ravenVersion = require('../package.json').version;

var protocolMap = {
  http: 80,
  https: 443
};

var consoleAlerts = {};

module.exports.disableConsoleAlerts = function disableConsoleAlerts() {
  consoleAlerts = false;
};

module.exports.consoleAlert = function consoleAlert(msg) {
  if (consoleAlerts) {
    console.log('raven@' + ravenVersion + ' alert: ' + msg);
  }
};

module.exports.consoleAlertOnce = function consoleAlertOnce(msg) {
  if (consoleAlerts && !(msg in consoleAlerts)) {
    consoleAlerts[msg] = true;
    console.log('raven@' + ravenVersion + ' alert: ' + msg);
  }
};

module.exports.extend = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }
  return target;
};

module.exports.getAuthHeader = function getAuthHeader(timestamp, apiKey, apiSecret) {
  var header = ['Sentry sentry_version=5'];
  header.push('sentry_timestamp=' + timestamp);
  header.push('sentry_client=raven-node/' + ravenVersion);
  header.push('sentry_key=' + apiKey);
  header.push('sentry_secret=' + apiSecret);
  return header.join(', ');
};

module.exports.parseDSN = function parseDSN(dsn) {
  if (!dsn) {
    // Let a falsey value return false explicitly
    return false;
  }
  try {
    var parsed = url.parse(dsn),
        response = {
          protocol: parsed.protocol.slice(0, -1),
          public_key: parsed.auth.split(':')[0],
          private_key: parsed.auth.split(':')[1],
          host: parsed.host.split(':')[0]
        };

    if (~response.protocol.indexOf('+')) {
      response.protocol = response.protocol.split('+')[1];
    }

    if (!transports.hasOwnProperty(response.protocol)) {
      throw new Error('Invalid transport');
    }

    var index = parsed.pathname.lastIndexOf('/');
    response.path = parsed.pathname.substr(0, index + 1);
    response.project_id = parsed.pathname.substr(index + 1);
    response.port = ~~parsed.port || protocolMap[response.protocol] || 443;
    return response;
  } catch (e) {
    throw new Error('Invalid Sentry DSN: ' + dsn);
  }
};

module.exports.getCulprit = function getCulprit(frame) {
  if (frame.module || frame.function) {
    return (frame.module || '?') + ' at ' + (frame.function || '?');
  }
  return '<unknown>';
};

var moduleCache;
module.exports.getModules = function getModules() {
  if (!moduleCache) {
    moduleCache = lsmod();
  }
  return moduleCache;
};


var LINES_OF_CONTEXT = 7;

function getFunction(line) {
  try {
    return line.getFunctionName() ||
      line.getTypeName() + '.' + (line.getMethodName() || '<anonymous>');
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return '<anonymous>';
  }
}

var mainModule = (require.main && require.main.filename && path.dirname(require.main.filename) || process.cwd()) + '/';

function getModule(filename, base) {
  if (!base) base = mainModule;

  // It's specifically a module
  var file = path.basename(filename, '.js');
  filename = path.dirname(filename);
  var n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return filename.substr(n + 14).replace(/\//g, '.') + ':' + file;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = (filename + '/').lastIndexOf(base, 0);
  if (n === 0) {
    var module = filename.substr(base.length).replace(/\//g, '.');
    if (module) module += ':';
    module += file;
    return module;
  }
  return file;
}

function parseLines(lines, frame) {
  frame.pre_context = lines.slice(Math.max(0, frame.lineno - (LINES_OF_CONTEXT + 1)), frame.lineno - 1);
  frame.context_line = lines[frame.lineno - 1];
  frame.post_context = lines.slice(frame.lineno, frame.lineno + LINES_OF_CONTEXT);
}

function parseStack(err, cb) {
  var frames = [],
      cache = {};

  if (!err) {
    return cb(frames);
  }

  var stack = stacktrace.parse(err);

  // check to make sure that the stack is what we need it to be.
  if (!stack || !Array.isArray(stack) || !stack.length || !stack[0].getFileName) {
    // lol, stack is fucked
    return cb(frames);
  }

  var callbacks = stack.length;

  // Sentry requires the stack trace to be from oldest to newest
  stack.reverse();

  return stack.forEach(function (line, index) {
    var frame = {
          filename: line.getFileName() || '',
          lineno: line.getLineNumber(),
          colno: line.getColumnNumber(),
          'function': getFunction(line),
        },
        isInternal = line.isNative() ||
          frame.filename[0] !== '/' &&
          frame.filename[0] !== '.' &&
          frame.filename.indexOf(':\\') !== 1;

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/raven-node/issues/176
    frame.in_app = !isInternal && frame.filename.indexOf('node_modules/') === -1;

    // Extract a module name based on the filename
    if (frame.filename) frame.module = getModule(frame.filename);

    // internal Node files are not full path names. Ignore them.
    if (isInternal) {
      frames[index] = frame;
      if (--callbacks === 0) cb(frames);
      return;
    }

    if (frame.filename in cache) {
      parseLines(cache[frame.filename], frame);
      if (--callbacks === 0) cb(frames);
      return;
    }

    fs.readFile(frame.filename, function (_err, file) {
      if (!_err) {
        file = file.toString().split('\n');
        cache[frame.filename] = file;
        parseLines(file, frame);
      }
      frames[index] = frame;
      if (--callbacks === 0) cb(frames);
    });
  });
}

// expose basically for testing because I don't know what I'm doing
module.exports.parseStack = parseStack;
module.exports.getModule = getModule;
