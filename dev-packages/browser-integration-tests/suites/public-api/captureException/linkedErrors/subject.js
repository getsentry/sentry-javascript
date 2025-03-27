const wat = new Error(`This is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be`);

wat.cause = new Error(`This is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be`);

Sentry.captureException(wat);
