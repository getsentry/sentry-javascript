<?php

namespace Sentry\Laravel\Tracing\Routing;

use Closure;
use Illuminate\Routing\Route;
use Sentry\SentrySdk;
use Sentry\Tracing\SpanContext;

abstract class TracingRoutingDispatcher
{
    protected function wrapRouteDispatch(callable $dispatch, Route $route)
    {
        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If there is no sampled span there is no need to wrap the dispatch
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return $dispatch();
        }

        // The action name can be a Closure curiously enough... so we guard againt that here
        // @see: https://github.com/getsentry/sentry-laravel/issues/917
        $action = $route->getActionName() instanceof Closure ? 'Closure' : $route->getActionName();

        $span = $parentSpan->startChild(
            SpanContext::make()
                ->setOp('http.route')
                ->setOrigin('auto.http.server')
                ->setDescription($action)
        );

        SentrySdk::getCurrentHub()->setSpan($span);

        try {
            return $dispatch();
        } finally {
            $span->finish();

            SentrySdk::getCurrentHub()->setSpan($parentSpan);
        }
    }
}
