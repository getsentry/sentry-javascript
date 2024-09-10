<?php

namespace Sentry\Laravel\Tests;

use Illuminate\Contracts\Debug\ExceptionHandler;
use Sentry\Laravel\Integration;

/**
 * This is a proxy class, so we can inject the Sentry bits while running tests and handle exceptions like "normal".
 */
class TestCaseExceptionHandler implements ExceptionHandler
{
    /** @var ExceptionHandler */
    private $handler;

    public function __construct(ExceptionHandler $handler)
    {
        $this->handler = $handler;
    }

    public function report($e)
    {
        Integration::captureUnhandledException($e);

        $this->handler->report($e);
    }

    public function shouldReport($e)
    {
        return $this->handler->shouldReport($e);
    }

    public function render($request, $e)
    {
        return $this->handler->render($request, $e);
    }

    public function renderForConsole($output, $e)
    {
        $this->handler->renderForConsole($output, $e);
    }

    public function __call($name, $arguments)
    {
        return $this->handler->{$name}(...$arguments);
    }
}
