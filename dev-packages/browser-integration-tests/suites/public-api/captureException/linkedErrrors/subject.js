const wat = new Error(`This is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be`);

wat.cause = new Error(`This is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,`);

Sentry.captureException(wat);
