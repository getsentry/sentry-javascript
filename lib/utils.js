var crypto = require('crypto');

module.exports.construct_checksum = function construct_checksum(kwargs) {
    var checksum = crypto.createHash('md5');
    checksum.update(kwargs['class_name'] || '');
    checksum.update(kwargs['traceback'] || kwargs['message'] || '');
    return checksum.digest('hex');
};

module.exports.get_signature = function get_signature(key, message, timestamp) {
    var hmac = crypto.createHmac('sha1', key);
    hmac.update(timestamp+' '+message);
    return hmac.digest('hex');
};

module.exports.get_auth_header = function get_auth_header(signature, timestamp) {
    var header = ['Sentry sentry_signature='+signature];
    header.push('sentry_timestamp='+timestamp);
    header.push('raven=0.1');
    return header.join(', ');
};