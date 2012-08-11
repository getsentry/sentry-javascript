var raven = require('./client'),
    crypto = require('crypto'),
    fs = require('fs'),
    url = require('url')
    transports = require('./transports');

var protocolMap = {
    'http': 80,
    'https': 443
};

module.exports.constructChecksum = function constructChecksum(kwargs) {
    var checksum = crypto.createHash('md5');
    checksum.update(kwargs['message'] || '');
    return checksum.digest('hex');
};

module.exports.getSignature = function getSignature(key, message, timestamp) {
    var hmac = crypto.createHmac('sha1', key);
    hmac.update(timestamp+' '+message);
    return hmac.digest('hex');
};

module.exports.getAuthHeader = function getAuthHeader(signature, timestamp, api_key, project_id) {
    var header = ['Sentry sentry_version=2.0'];
    header.push('sentry_signature='+signature);
    header.push('sentry_timestamp='+timestamp);
    header.push('sentry_client=raven-node/'+raven.version);
    header.push('sentry_key='+api_key);
    header.push('project_id='+project_id);
    return header.join(', ');
};

module.exports.parseDSN = function parseDSN(dsn) {
    if(!dsn) {
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

        if(~response.protocol.indexOf('+'))
            response.protocol = response.protocol.split('+')[1];

        if(!transports.hasOwnProperty(response.protocol))
            throw new Error('Invalid transport');

        var path = parsed.path.substr(1),
            index = path.lastIndexOf('/');
        response.path = path.substr(0, index);
        response.project_id = ~~path.substr(index+1);
        response.port = ~~parsed.port || protocolMap[response.protocol] || 443;
        return response;
    } catch(e) {
        throw new Error('Invalid Sentry DSN: ' + dsn);
    }
};

var module_cache;
module.exports.getModules = function getModules() {
    if(module_cache) {
        return module_cache;
    }
    var path = require('path');
    var cwd = path.resolve('.');
    var folders = fs.readdirSync(path.join(cwd, './node_modules/'));
    folders = folders.filter(function(f){
        return f.charAt(0) !== '.';
    });
    module_cache = {};
    folders.forEach(function(folder) {
        try {
            var json = require(path.join(cwd, './node_modules/'+folder+'/package.json'));
            module_cache[json.name] = json.version;
        } catch(e){}
    });
    return module_cache;
};

var LINES_OF_CONTEXT = 7;

/*
 * Testing out with a custom stack track.
 * (Not done)
 */
module.exports.parseStackBetter = function parseStackBetter(err, cb) {
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack){ return stack; };
    //Error.captureStackTrace(err);
    var lines = err.stack;
    Error.prepareStackTrace = orig;
    
    lines.forEach(function(line, index){
        var frame = {
            function: line.getFunctionName(),
            filename: line.getFileName(),
            lineno: line.getLineNumber(),
            typename: line.getTypeName()
        };
        if(line.getFunctionName() !== 'handle_request1') return;
        console.log(line.getFunction().arguments);
        if(line.fun && line.fun.arguments) {
            frame.args = [];
            for(var i=0, j=line.fun.arguments.length; i<j; i++) {
                frame.args.push(line.fun.arguments[i]);
            }
        }
        console.log(frame);
    });
};

module.exports.parseStack = function parseStack(stack, cb) {
    try {
        // grab all lines except the first
        var lines = stack.split('\n').slice(1),
            callbacks=lines.length,
            frames=[],
            cache={};
        
        if(lines.length === 0) {
            throw new Error('No lines to parse!');
        }

        lines.forEach(function(line, index) {
            var pattern = /^\s*at (?:(.+(?: \[\w\s+\])?) )?\(?(.+?)(?::(\d+):(\d+))?\)?$/,
                data = line.match(pattern).slice(1),
                frame = {
                    filename: data[1],
                    lineno: ~~data[2]
                };

            // only set the function key if it exists
            if(data[0]) {
                frame['function'] = data[0];
            }
            // internal Node files are not full path names. Ignore them.
            if(frame.filename[0] === '/' || frame.filename[0] === '.') {
                // check if it has been read in first
                if(frame.filename in cache) {
                    parseLines(cache[frame.filename]);
                    if(--callbacks === 0) cb(null, frames);
                } else {
                    fs.readFile(frame.filename, function(err, file) {
                        if(!err) {
                            file = file.toString().split('\n');
                            cache[frame.filename] = file;
                            parseLines(file);
                        }
                        frames[index] = frame;
                        if(--callbacks === 0) cb(null, frames);
                    });
                }
            } else {
                frames[index] = frame;
                if(--callbacks === 0) cb(null, frames);
            }

            function parseLines(lines) {
                frame.pre_context = lines.slice(Math.max(0, frame.lineno-(LINES_OF_CONTEXT+1)), frame.lineno-1);
                frame.context_line = lines[frame.lineno-1];
                frame.post_context = lines.slice(frame.lineno, frame.lineno+LINES_OF_CONTEXT);
            }
        });
    } catch(e) {
        cb(new Error('Can\'t parse stack trace:\n' + stack));
    }
};
