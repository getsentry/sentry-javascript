const crypto = require('crypto');
const assert = require('assert');

function longWork(count = 100) {
  for (let i = 0; i < count; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

function longWorkOther() {
  for (let i = 0; i < 200; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

exports.longWork = longWork;
exports.longWorkOther = longWorkOther;
