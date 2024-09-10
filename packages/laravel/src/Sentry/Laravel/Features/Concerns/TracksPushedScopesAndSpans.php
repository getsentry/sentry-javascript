<?php

namespace Sentry\Laravel\Features\Concerns;

use Sentry\Laravel\Integration;
use Sentry\SentrySdk;
use Sentry\Tracing\Span;
use Sentry\Tracing\SpanStatus;

trait TracksPushedScopesAndSpans
{
    /**
     * Hold the number of times the scope was pushed.
     *
     * @var int
     */
    private $pushedScopeCount = 0;

    /**
     * Hold the stack of parent spans that need to be put back on the scope.
     *
     * @var array<int, Span|null>
     */
    private $parentSpanStack = [];

    /**
     * Hold the stack of current spans that need to be finished still.
     *
     * @var array<int, Span|null>
     */
    private $currentSpanStack = [];

    protected function pushSpan(Span $span): void
    {
        $hub = SentrySdk::getCurrentHub();

        $this->parentSpanStack[] = $hub->getSpan();

        $hub->setSpan($span);

        $this->currentSpanStack[] = $span;
    }

    protected function pushScope(): void
    {
        SentrySdk::getCurrentHub()->pushScope();

        ++$this->pushedScopeCount;
    }

    protected function maybePopSpan(): ?Span
    {
        if (count($this->currentSpanStack) === 0) {
            return null;
        }

        $parent = array_pop($this->parentSpanStack);

        SentrySdk::getCurrentHub()->setSpan($parent);

        return array_pop($this->currentSpanStack);
    }

    protected function maybePopScope(): void
    {
        Integration::flushEvents();

        if ($this->pushedScopeCount === 0) {
            return;
        }

        SentrySdk::getCurrentHub()->popScope();

        --$this->pushedScopeCount;
    }

    protected function maybeFinishSpan(?SpanStatus $status = null): ?Span
    {
        $span = $this->maybePopSpan();

        if ($span === null) {
            return null;
        }

        if ($status !== null) {
            $span->setStatus($status);
        }

        $span->finish();

        return $span;
    }
}
