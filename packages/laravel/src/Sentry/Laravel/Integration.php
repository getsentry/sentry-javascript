<?php

namespace Sentry\Laravel;

use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Routing\Route;
use Sentry\EventHint;
use Sentry\EventId;
use Sentry\ExceptionMechanism;
use Sentry\Laravel\Integration\ModelViolations as ModelViolationReports;
use Sentry\SentrySdk;
use Sentry\Tracing\TransactionSource;
use Throwable;
use Sentry\Breadcrumb;
use Sentry\Event;
use Sentry\Integration\IntegrationInterface;
use Sentry\State\Scope;

use function Sentry\addBreadcrumb;
use function Sentry\configureScope;
use function Sentry\getBaggage;
use function Sentry\getTraceparent;
use function Sentry\getW3CTraceparent;
use function Sentry\metrics;

class Integration implements IntegrationInterface
{
    /**
     * @var null|string
     */
    private static $transaction;

    /**
     * {@inheritdoc}
     */
    public function setupOnce(): void
    {
        Scope::addGlobalEventProcessor(static function (Event $event): Event {
            $self = SentrySdk::getCurrentHub()->getIntegration(self::class);

            if (!$self instanceof self) {
                return $event;
            }

            if (empty($event->getTransaction())) {
                $event->setTransaction(self::getTransaction());
            }

            return $event;
        });
    }

    /**
     * Convenience method to register the exception handler with Laravel 11.0 and up.
     */
    public static function handles(Exceptions $exceptions): void
    {
        $exceptions->reportable(static function (Throwable $exception) {
            self::captureUnhandledException($exception);
        });
    }

    /**
     * Adds a breadcrumb if the integration is enabled for Laravel.
     *
     * @param Breadcrumb $breadcrumb
     */
    public static function addBreadcrumb(Breadcrumb $breadcrumb): void
    {
        $self = SentrySdk::getCurrentHub()->getIntegration(self::class);

        if (!$self instanceof self) {
            return;
        }

        addBreadcrumb($breadcrumb);
    }

    /**
     * Configures the scope if the integration is enabled for Laravel.
     *
     * @param callable $callback
     */
    public static function configureScope(callable $callback): void
    {
        $self = SentrySdk::getCurrentHub()->getIntegration(self::class);

        if (!$self instanceof self) {
            return;
        }

        configureScope($callback);
    }

    /**
     * @return null|string
     */
    public static function getTransaction(): ?string
    {
        return self::$transaction;
    }

    /**
     * @param null|string $transaction
     */
    public static function setTransaction(?string $transaction): void
    {
        self::$transaction = $transaction;
    }

    /**
     * Block until all events are processed by the PHP SDK client. Also flushes metrics.
     *
     * @internal This is not part of the public API and is here temporarily until
     *  the underlying issue can be resolved, this method will be removed.
     */
    public static function flushEvents(): void
    {
        $client = SentrySdk::getCurrentHub()->getClient();

        if ($client !== null) {
            $client->flush();
        }

        metrics()->flush();
    }

    /**
     * Extract the readable name for a route and the transaction source for where that route name came from.
     *
     * @param \Illuminate\Routing\Route $route
     *
     * @return array{0: string, 1: \Sentry\Tracing\TransactionSource}
     *
     * @internal This helper is used in various places to extract meaningful info from a Laravel Route object.
     */
    public static function extractNameAndSourceForRoute(Route $route): array
    {
        return [
            '/' . ltrim($route->uri(), '/'),
            TransactionSource::route(),
        ];
    }

    /**
     * Extract the readable name for a Lumen route and the transaction source for where that route name came from.
     *
     * @param array $routeData The array of route data
     * @param string $path The path of the request
     *
     * @return array{0: string, 1: \Sentry\Tracing\TransactionSource}
     *
     * @internal This helper is used in various places to extract meaningful info from Lumen route data.
     */
    public static function extractNameAndSourceForLumenRoute(array $routeData, string $path): array
    {
        $routeUri = array_reduce(
            array_keys($routeData[2]),
            static function ($carry, $key) use ($routeData) {
                $search = '/' . preg_quote($routeData[2][$key], '/') . '/';

                // Replace the first occurrence of the route parameter value with the key name
                // This is by no means a perfect solution, but it's the best we can do with the data we have
                return preg_replace($search, "{{$key}}", $carry, 1);
            },
            $path
        );

        return [
            '/' . ltrim($routeUri, '/'),
            TransactionSource::route(),
        ];
    }

    /**
     * Retrieve the meta tags with tracing information to link this request to front-end requests.
     * This propagates the Dynamic Sampling Context.
     *
     * @return string
     */
    public static function sentryMeta(): string
    {
        return self::sentryTracingMeta() . self::sentryW3CTracingMeta() . self::sentryBaggageMeta();
    }

    /**
     * Retrieve the `sentry-trace` meta tag with tracing information to link this request to front-end requests.
     *
     * @return string
     */
    public static function sentryTracingMeta(): string
    {
        return sprintf('<meta name="sentry-trace" content="%s"/>', getTraceparent());
    }

    /**
     * Retrieve the `traceparent` meta tag with tracing information to link this request to front-end requests.
     *
     * @return string
     */
    public static function sentryW3CTracingMeta(): string
    {
        return sprintf('<meta name="traceparent" content="%s"/>', getW3CTraceparent());
    }

    /**
     * Retrieve the `baggage` meta tag with information to link this request to front-end requests.
     * This propagates the Dynamic Sampling Context.
     *
     * @return string
     */
    public static function sentryBaggageMeta(): string
    {
        return sprintf('<meta name="baggage" content="%s"/>', getBaggage());
    }

    /**
     * Capture a unhandled exception and report it to Sentry.
     *
     * @param \Throwable $throwable
     *
     * @return \Sentry\EventId|null
     */
    public static function captureUnhandledException(Throwable $throwable): ?EventId
    {
        // We instruct users to call `captureUnhandledException` in their exception handler, however this does not mean
        // the exception was actually unhandled. Laravel has the `report` helper function that is used to report to a log
        // file or Sentry, but that means they are handled otherwise they wouldn't have been routed through `report`. So to
        // prevent marking those as "unhandled" we try and make an educated guess if the call to `captureUnhandledException`
        // came from the `report` helper and shouldn't be marked as "unhandled" even though the come to us here to be reported
        $handled = self::makeAnEducatedGuessIfTheExceptionMaybeWasHandled();

        $hint = EventHint::fromArray([
            'mechanism' => new ExceptionMechanism(ExceptionMechanism::TYPE_GENERIC, $handled),
        ]);

        return SentrySdk::getCurrentHub()->captureException($throwable, $hint);
    }

    /**
     * Returns a callback that can be passed to `Model::handleMissingAttributeViolationUsing` to report missing attribute violations to Sentry.
     *
     * @param callable|null $callback                 Optional callback to be called after the violation is reported to Sentry.
     * @param bool          $suppressDuplicateReports Whether to suppress duplicate reports of the same violation.
     * @param bool          $reportAfterResponse      Whether to delay sending the report to after the response has been sent.
     *
     * @return callable
     */
    public static function missingAttributeViolationReporter(?callable $callback = null, bool $suppressDuplicateReports = true, bool $reportAfterResponse = true): callable
    {
        return new ModelViolationReports\MissingAttributeModelViolationReporter($callback, $suppressDuplicateReports, $reportAfterResponse);
    }

    /**
     * Returns a callback that can be passed to `Model::handleLazyLoadingViolationUsing` to report lazy loading violations to Sentry.
     *
     * @param callable|null $callback                 Optional callback to be called after the violation is reported to Sentry.
     * @param bool          $suppressDuplicateReports Whether to suppress duplicate reports of the same violation.
     * @param bool          $reportAfterResponse      Whether to delay sending the report to after the response has been sent.
     *
     * @return callable
     */
    public static function lazyLoadingViolationReporter(?callable $callback = null, bool $suppressDuplicateReports = true, bool $reportAfterResponse = true): callable
    {
        return new ModelViolationReports\LazyLoadingModelViolationReporter($callback, $suppressDuplicateReports, $reportAfterResponse);
    }

    /**
     * Returns a callback that can be passed to `Model::handleDiscardedAttributeViolationUsing` to report discarded attribute violations to Sentry.
     *
     * @param callable|null $callback                 Optional callback to be called after the violation is reported to Sentry.
     * @param bool          $suppressDuplicateReports Whether to suppress duplicate reports of the same violation.
     * @param bool          $reportAfterResponse      Whether to delay sending the report to after the response has been sent.
     *
     * @return callable
     */
    public static function discardedAttributeViolationReporter(?callable $callback = null, bool $suppressDuplicateReports = true, bool $reportAfterResponse = true): callable
    {
        return new ModelViolationReports\DiscardedAttributeViolationReporter($callback, $suppressDuplicateReports, $reportAfterResponse);
    }

    /**
     * Try to make an educated guess if the call came from the Laravel `report` helper.
     *
     * @see https://github.com/laravel/framework/blob/008a4dd49c3a13343137d2bc43297e62006c7f29/src/Illuminate/Foundation/helpers.php#L667-L682
     *
     * @return bool
     */
    private static function makeAnEducatedGuessIfTheExceptionMaybeWasHandled(): bool
    {
        // We limit the amount of backtrace frames since it is very unlikely to be any deeper
        $trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 20);

        // We are looking for `$handler->report()` to be called from the `report()` function
        foreach ($trace as $frameIndex => $frame) {
            // We need a frame with a class and function defined, we can skip frames missing either
            if (!isset($frame['class'], $frame['function'])) {
                continue;
            }

            // Check if the frame was indeed `$handler->report()`
            if ($frame['type'] !== '->' || $frame['function'] !== 'report') {
                continue;
            }

            // Make sure we have a next frame, we could have reached the end of the trace
            if (!isset($trace[$frameIndex + 1])) {
                continue;
            }

            // The next frame should contain the call to the `report()` helper function
            $nextFrame = $trace[$frameIndex + 1];

            // If a class was set or the function name is not `report` we can skip this frame
            if (isset($nextFrame['class']) || !isset($nextFrame['function']) || $nextFrame['function'] !== 'report') {
                continue;
            }

            // If we reached this point we can be pretty sure the `report` function was called
            // and we can come to the educated conclusion the exception was indeed handled
            return true;
        }

        // If we reached this point we can be pretty sure the `report` function was not called
        return false;
    }
}
