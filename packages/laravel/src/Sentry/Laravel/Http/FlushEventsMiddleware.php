<?php

namespace Sentry\Laravel\Http;

use Closure;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;

class FlushEventsMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        return $next($request);
    }

    public function terminate(Request $request, $response): void
    {
        Integration::flushEvents();
    }
}
