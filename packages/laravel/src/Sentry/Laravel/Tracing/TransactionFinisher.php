<?php

namespace Sentry\Laravel\Tracing;

/**
 * @internal
 */
class TransactionFinisher
{
    public function __construct()
    {
        // We need to finish the transaction after the response has been sent to the client
        // so we register a terminating callback to do so, this allows us to also capture
        // spans that are created during the termination of the application like queue
        // dispatches using dispatch(...)->afterResponse() which are terminating
        // callbacks themselfs just like we do below.
        //
        // This class is registered as a singleton in the container to ensure it's only
        // instantiated once and the terminating callback is only registered once.
        //
        // It should be resolved from the container before the terminating callbacks are called.
        // Good place is in the `terminate` callback of a middleware for example.
        // This way we can be 99.9% sure to be the last ones to run.
        app()->terminating(function () {
            app(Middleware::class)->finishTransaction();
        });
    }
}
