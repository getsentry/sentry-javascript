<?php

namespace Sentry\Laravel\Tracing;

use Exception;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Events as DatabaseEvents;
use Illuminate\Routing\Events as RoutingEvents;
use RuntimeException;
use Sentry\Laravel\Features\Concerns\ResolvesEventOrigin;
use Sentry\Laravel\Integration;
use Sentry\SentrySdk;
use Sentry\Tracing\Span;
use Sentry\Tracing\SpanContext;
use Sentry\Tracing\SpanStatus;
use Symfony\Component\HttpFoundation\Response;

class EventHandler
{
    use ResolvesEventOrigin;

    /**
     * Map event handlers to events.
     *
     * @var array
     */
    protected static $eventHandlerMap = [
        RoutingEvents\RouteMatched::class => 'routeMatched',
        DatabaseEvents\QueryExecuted::class => 'queryExecuted',
        RoutingEvents\ResponsePrepared::class => 'responsePrepared',
        RoutingEvents\PreparingResponse::class => 'responsePreparing',
        DatabaseEvents\TransactionBeginning::class => 'transactionBeginning',
        DatabaseEvents\TransactionCommitted::class => 'transactionCommitted',
        DatabaseEvents\TransactionRolledBack::class => 'transactionRolledBack',
    ];

    /**
     * Indicates if we should we add SQL queries as spans.
     *
     * @var bool
     */
    private $traceSqlQueries;

    /**
     * Indicates if we should add query bindings to query spans.
     *
     * @var bool
     */
    private $traceSqlBindings;

    /**
     * Indicates if we should we add SQL query origin data to query spans.
     *
     * @var bool
     */
    private $traceSqlQueryOrigin;

    /**
     * The threshold in milliseconds to consider a SQL query origin.
     *
     * @var int
     */
    private $traceSqlQueryOriginTreshHoldMs;

    /**
     * Indicates if we should trace queue job spans.
     *
     * @var bool
     */
    private $traceQueueJobs;

    /**
     * Indicates if we should trace queue jobs as separate transactions.
     *
     * @var bool
     */
    private $traceQueueJobsAsTransactions;

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

    /**
     * EventHandler constructor.
     */
    public function __construct(array $config)
    {
        $this->traceSqlQueries = ($config['sql_queries'] ?? true) === true;
        $this->traceSqlBindings = ($config['sql_bindings'] ?? true) === true;
        $this->traceSqlQueryOrigin = ($config['sql_origin'] ?? true) === true;
        $this->traceSqlQueryOriginTreshHoldMs = $config['sql_origin_threshold_ms'] ?? 100;

        $this->traceQueueJobs = ($config['queue_jobs'] ?? false) === true;
        $this->traceQueueJobsAsTransactions = ($config['queue_job_transactions'] ?? false) === true;
    }

    /**
     * Attach all event handlers.
     *
     * @uses self::routeMatchedHandler()
     * @uses self::queryExecutedHandler()
     * @uses self::responsePreparedHandler()
     * @uses self::responsePreparingHandler()
     * @uses self::transactionBeginningHandler()
     * @uses self::transactionCommittedHandler()
     * @uses self::transactionRolledBackHandler()
     */
    public function subscribe(Dispatcher $dispatcher): void
    {
        foreach (static::$eventHandlerMap as $eventName => $handler) {
            $dispatcher->listen($eventName, [$this, $handler]);
        }
    }

    /**
     * Pass through the event and capture any errors.
     *
     * @param string $method
     * @param array $arguments
     */
    public function __call(string $method, array $arguments)
    {
        $handlerMethod = "{$method}Handler";

        if (!method_exists($this, $handlerMethod)) {
            throw new RuntimeException("Missing tracing event handler: {$handlerMethod}");
        }

        try {
            $this->{$handlerMethod}(...$arguments);
        } catch (Exception $e) {
            // Ignore to prevent bubbling up errors in the SDK
        }
    }

    protected function routeMatchedHandler(RoutingEvents\RouteMatched $match): void
    {
        $transaction = SentrySdk::getCurrentHub()->getTransaction();

        if ($transaction === null) {
            return;
        }

        [$transactionName, $transactionSource] = Integration::extractNameAndSourceForRoute($match->route);

        $transaction->setName($transactionName);
        $transaction->getMetadata()->setSource($transactionSource);
    }

    protected function queryExecutedHandler(DatabaseEvents\QueryExecuted $query): void
    {
        if (!$this->traceSqlQueries) {
            return;
        }

        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If there is no sampled span there is no need to handle the event
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return;
        }

        $context = SpanContext::make()
            ->setOp('db.sql.query')
            ->setData([
                'db.name' => $query->connection->getDatabaseName(),
                'db.system' => $query->connection->getDriverName(),
                'server.address' => $query->connection->getConfig('host'),
                'server.port' => $query->connection->getConfig('port'),
            ])
            ->setOrigin('auto.db')
            ->setDescription($query->sql)
            ->setStartTimestamp(microtime(true) - $query->time / 1000);

        $context->setEndTimestamp($context->getStartTimestamp() + $query->time / 1000);

        if ($this->traceSqlBindings) {
            $context->setData(array_merge($context->getData(), [
                'db.sql.bindings' => $query->bindings
            ]));
        }

        if ($this->traceSqlQueryOrigin && $query->time >= $this->traceSqlQueryOriginTreshHoldMs) {
            $queryOrigin = $this->resolveEventOrigin();

            if ($queryOrigin !== null) {
                $context->setData(array_merge($context->getData(), $queryOrigin));
            }
        }

        $parentSpan->startChild($context);
    }

    protected function responsePreparedHandler(RoutingEvents\ResponsePrepared $event): void
    {
        $span = $this->popSpan();

        if ($span !== null) {
            $span->finish();
        }
    }

    protected function responsePreparingHandler(RoutingEvents\PreparingResponse $event): void
    {
        // If the response is already a Response object there is no need to handle the event anymore
        // since there isn't going to be any real work going on, the response is already as prepared
        // as it can be. So we ignore the event to prevent loggin a very short empty duplicated span
        if ($event->response instanceof Response) {
            return;
        }

        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If there is no sampled span there is no need to handle the event
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return;
        }

        $this->pushSpan(
            $parentSpan->startChild(
                SpanContext::make()
                    ->setOp('http.route.response')
                    ->setOrigin('auto.http.server')
            )
        );
    }

    protected function transactionBeginningHandler(DatabaseEvents\TransactionBeginning $event): void
    {
        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If there is no sampled span there is no need to handle the event
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return;
        }

        $this->pushSpan(
            $parentSpan->startChild(
                SpanContext::make()
                    ->setOp('db.transaction')
                    ->setOrigin('auto.db')
            )
        );
    }

    protected function transactionCommittedHandler(DatabaseEvents\TransactionCommitted $event): void
    {
        $span = $this->popSpan();

        if ($span !== null) {
            $span->setStatus(SpanStatus::ok());
            $span->finish();
        }
    }

    protected function transactionRolledBackHandler(DatabaseEvents\TransactionRolledBack $event): void
    {
        $span = $this->popSpan();

        if ($span !== null) {
            $span->setStatus(SpanStatus::internalError());
            $span->finish();
        }
    }

    private function pushSpan(Span $span): void
    {
        $hub = SentrySdk::getCurrentHub();

        $this->parentSpanStack[] = $hub->getSpan();

        $hub->setSpan($span);

        $this->currentSpanStack[] = $span;
    }

    private function popSpan(): ?Span
    {
        if (count($this->currentSpanStack) === 0) {
            return null;
        }

        $parent = array_pop($this->parentSpanStack);

        SentrySdk::getCurrentHub()->setSpan($parent);

        return array_pop($this->currentSpanStack);
    }
}
