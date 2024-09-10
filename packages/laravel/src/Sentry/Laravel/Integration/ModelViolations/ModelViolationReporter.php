<?php

namespace Sentry\Laravel\Integration\ModelViolations;

use Exception;
use Illuminate\Database\Eloquent\Model;
use Sentry\Event;
use Sentry\EventHint;
use Sentry\ExceptionMechanism;
use Sentry\Laravel\Features\Concerns\ResolvesEventOrigin;
use Sentry\SentrySdk;
use Sentry\Severity;
use Sentry\State\Scope;

abstract class ModelViolationReporter
{
    use ResolvesEventOrigin;

    /** @var callable|null $callback */
    private $callback;

    /** @var bool $suppressDuplicateReports */
    private $suppressDuplicateReports;

    /** @var bool $reportAfterResponse */
    private $reportAfterResponse;

    /** @var array<string, true> $reportedViolations */
    private $reportedViolations = [];

    public function __construct(?callable $callback, bool $suppressDuplicateReports, bool $reportAfterResponse)
    {
        $this->callback = $callback;
        $this->suppressDuplicateReports = $suppressDuplicateReports;
        $this->reportAfterResponse = $reportAfterResponse;
    }

    /** @param string|array<int, string> $propertyOrProperties */
    public function __invoke(Model $model, $propertyOrProperties): void
    {
        $property = is_array($propertyOrProperties)
            ? implode(', ', $propertyOrProperties)
            : $propertyOrProperties;

        if (!$this->shouldReport($model, $property)) {
            return;
        }

        $this->markAsReported($model, $property);

        $origin = $this->resolveEventOrigin();

        if ($this->reportAfterResponse) {
            app()->terminating(function () use ($model, $property, $origin) {
                $this->report($model, $property, $origin);
            });
        } else {
            $this->report($model, $property, $origin);
        }
    }

    abstract protected function getViolationContext(Model $model, string $property): array;

    abstract protected function getViolationException(Model $model, string $property): Exception;

    protected function shouldReport(Model $model, string $property): bool
    {
        if (!$this->suppressDuplicateReports) {
            return true;
        }

        return !array_key_exists(get_class($model) . $property, $this->reportedViolations);
    }

    protected function markAsReported(Model $model, string $property): void
    {
        if (!$this->suppressDuplicateReports) {
            return;
        }

        $this->reportedViolations[get_class($model) . $property] = true;
    }

    private function report(Model $model, string $property, $origin): void
    {
        SentrySdk::getCurrentHub()->withScope(function (Scope $scope) use ($model, $property, $origin) {
            $scope->setContext('violation', array_merge([
                'model' => get_class($model),
                'origin' => $origin,
            ], $this->getViolationContext($model, $property)));

            SentrySdk::getCurrentHub()->captureEvent(
                tap(Event::createEvent(), static function (Event $event) {
                    $event->setLevel(Severity::warning());
                }),
                EventHint::fromArray([
                    'exception' => $this->getViolationException($model, $property),
                    'mechanism' => new ExceptionMechanism(ExceptionMechanism::TYPE_GENERIC, true),
                ])
            );
        });

        // Forward the violation to the next handler if there is one
        if ($this->callback !== null) {
            call_user_func($this->callback, $model, $property);
        }
    }
}
