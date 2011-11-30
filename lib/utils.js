var crypto = require('crypto'),
    fs = require('fs'),
    LINES_OF_CONTEXT = 7;

module.exports.construct_checksum = function construct_checksum(kwargs) {
    var checksum = crypto.createHash('md5');
    checksum.update(kwargs['message'] || '');
    return checksum.digest('hex');
};

module.exports.get_signature = function get_signature(key, message, timestamp) {
    var hmac = crypto.createHmac('sha1', key);
    hmac.update(timestamp+' '+message);
    return hmac.digest('hex');
};

module.exports.get_auth_header = function get_auth_header(signature, timestamp, api_key) {
    var header = ['Sentry sentry_signature='+signature];
    header.push('sentry_timestamp='+timestamp);
    header.push('sentry_client=raven-node/0.1');
    if(api_key) header.push('sentry_key='+api_key);
    return header.join(', ');
};

module.exports.parseStack = function parseStack(stack, callback) {
    // grab all lines except the first
    var lines = stack.split('\n').slice(1), callbacks=lines.length, frames=[], cache={};

    lines.forEach(function(line, index) {
        var data = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)$/).slice(1),
            frame = {
                function: data[0],
                filename: data[1],
                lineno: ~~data[2]
            };
        // internal Node files are not full path names. Ignore them.
        if(frame.filename[0] === '/') {
            // check if it has been read in first
            if(frame.filename in cache) {
                parseLines(cache[frame.filename]);
                if(--callbacks === 0) callback(null, frames);
            } else {
                fs.readFile(frame.filename, function(err, file) {
                    file = file.toString().split('\n');
                    cache[frame.filename] = file;
                    parseLines(file);
                    if(--callbacks === 0) callback(null, frames);
                });
            }
        } else {
            frames[index] = frame;
            if(--callbacks === 0) callback(null, frames);
        }

        function parseLines(lines) {
            frame.pre_context = lines.slice(Math.max(0, frame.lineno-(LINES_OF_CONTEXT+1)), frame.lineno-1);
            frame.context_line = lines[frame.lineno-1];
            frame.post_context = lines.slice(frame.lineno, frame.lineno+LINES_OF_CONTEXT);
            frames[index] = frame;
        }
    });
}