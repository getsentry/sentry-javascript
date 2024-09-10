<?php

namespace Sentry\Features;

use Illuminate\Routing\Router;
use Sentry\Laravel\Tests\TestCase;

class RouteIntegrationTest extends TestCase
{
    protected function defineRoutes($router): void
    {
        $router->group(['prefix' => 'sentry'], function (Router $router) {
            $router->get('/ok', function () {
                return 'ok';
            });

            $router->get('/abort/{code}', function (int $code) {
                abort($code);
            });
        });
    }

    /** @define-env envSamplingAllTransactions */
    public function testTransactionIsRecordedForRoute(): void
    {
        $this->get('/sentry/ok')->assertOk();

        $this->assertSentryTransactionCount(1);
    }

    /** @define-env envSamplingAllTransactions */
    public function testTransactionIsRecordedForNotFound(): void
    {
        $this->get('/sentry/abort/404')->assertNotFound();

        $this->assertSentryTransactionCount(1);
    }

    /** @define-env envSamplingAllTransactions */
    public function testTransactionIsDroppedForUndefinedRoute(): void
    {
        $this->get('/sentry/non-existent-route')->assertNotFound();

        $this->assertSentryTransactionCount(0);
    }
}
