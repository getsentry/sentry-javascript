var utils = require('./utils');
var url = require('url');

function FormatSourcePosition(frame) {
  var fileName;
  var fileLocation = "";
  if (frame.isNative()) {
    fileLocation = "native";
  } else if (frame.isEval()) {
    fileName = frame.getScriptNameOrSourceURL();
    if (!fileName) {
      fileLocation = frame.getEvalOrigin();
    }
  } else {
    fileName = frame.getFileName();
  }

  if (fileName) {
    fileLocation += fileName;
    var lineNumber = frame.getLineNumber();
    if (lineNumber != null) {
      fileLocation += ":" + lineNumber;
      var columnNumber = frame.getColumnNumber();
      if (columnNumber) {
        fileLocation += ":" + columnNumber;
      }
    }
  }

  if (!fileLocation) {
    fileLocation = "unknown source";
  }
  var line = "";
  var functionName = frame.getFunction().name;
  var addPrefix = true;
  var isConstructor = frame.isConstructor();
  var isMethodCall = !(frame.isToplevel() || isConstructor);
  if (isMethodCall) {
    var methodName = frame.getMethodName();
    line += frame.getTypeName() + ".";
    if (functionName) {
      line += functionName;
      if (methodName && (methodName != functionName)) {
        line += " [as " + methodName + "]";
      }
    } else {
      line += methodName || "<anonymous>";
    }
  } else if (isConstructor) {
    line += "new " + (functionName || "<anonymous>");
  } else if (functionName) {
    line += functionName;
  } else {
    line += fileLocation;
    addPrefix = false;
  }
  if (addPrefix) {
    line += " (" + fileLocation + ")";
  }
  return line;
}

function FormatStackTrace(error, frames) {
  var lines = [];
  try {
    lines.push(error.toString());
  } catch (e) {
    try {
      lines.push("<error: " + e + ">");
    } catch (ee) {
      lines.push("<error>");
    }
  }
  for (var i = 0; i < frames.length; i++) {
    var frame = frames[i];
    var line;
    try {
      line = FormatSourcePosition(frame);
    } catch (e) {
      try {
        line = "<error: " + e + ">";
      } catch (ee) {
        // Any code that reaches this point is seriously nasty!
        line = "<error>";
      }
    }
    lines.push("    at " + line);
  }
  return lines.join("\n");
}

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};


module.exports.parseError = function parseError(err, kwargs, cb) {
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(error, frames) { return arguments; };
    // prepareStackTrace is triggered the first time .stack is accessed
    // so this is explicitly triggering it
    var stack_arguments = err.stack;
    err.stack = FormatStackTrace(stack_arguments[0], stack_arguments[1]);
    var stack = stack_arguments[1];

    utils.parseStack(stack, function(frames) {
        kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
        kwargs['sentry.interfaces.Exception'] = {
            type: err.name,
            value:err.message
        };

        kwargs['sentry.interfaces.Stacktrace'] = {frames: frames};

        cb(kwargs);
    });
};

module.exports.parseQuery = function parseQuery(query, engine, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = query;
    kwargs['sentry.interfaces.Query'] = {
        query: query,
        engine: engine
    };
    return kwargs;
};

module.exports.parseRequest = function parseRequest(req, kwargs) {
    kwargs = kwargs || {};
    kwargs['sentry.interfaces.Http'] = {
        method: req.method,
        query_string: url.parse(req.url).query,
        headers: req.headers,
        cookies: req.cookies || '<unavailable: use cookieParser middleware>',
        data: req.body || '<unavailable: use bodyParser middleware>',
        url: (function build_absolute_url() {
            var protocol = req.socket.encrypted ? 'https' : 'http',
                host = req.headers.host || '<no host>';
            return protocol+'://'+host+req.url;
        }()),
        env: process.env
    };
    return kwargs;
};
