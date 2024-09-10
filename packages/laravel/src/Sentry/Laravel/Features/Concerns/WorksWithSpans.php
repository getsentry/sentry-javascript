<?php

namespace Sentry\Laravel\Features\Concerns;

use Sentry\SentrySdk;
use Sentry\Tracing\Span;

trait WorksWithSpans
{
    protected function getParentSpanIfSampled(): ?Span
    {
        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If the span is not available or not sampled we don't need to do anything
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return null;
        }

        return $parentSpan;
    }

    /** @param callable(Span $parentSpan): void $callback */
    protected function withParentSpanIfSampled(callable $callback): void
    {
        $parentSpan = $this->getParentSpanIfSampled();

        if ($parentSpan === null) {
            return;
        }

        $callback($parentSpan);
    }
}
