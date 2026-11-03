// Callback-style handler `(event, context, callback)` to exercise the wrapped-callback span path.
// `event.callbackDelayMs` makes the handler return before it calls back, like most real callback-style handlers.
exports.handler = (event, context, callback) => {
  const respond = () => {
    if (event.shouldError) {
      callback(new Error('callback error'));
      return;
    }

    callback(null, { ok: true });
  };

  if (event.callbackDelayMs) {
    setTimeout(respond, event.callbackDelayMs);
    return;
  }

  respond();
};
