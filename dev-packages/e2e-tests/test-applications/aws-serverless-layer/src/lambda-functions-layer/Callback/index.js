// Callback-style handler `(event, context, callback)` to exercise the wrapped-callback span path.
exports.handler = (event, context, callback) => {
  if (event.shouldError) {
    callback(new Error('callback error'));
    return;
  }

  callback(null, { ok: true });
};
