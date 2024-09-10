<?php

namespace Sentry\Http;

use Nyholm\Psr7\ServerRequest;
use Sentry\Laravel\Http\LaravelRequestFetcher;
use Sentry\Laravel\Tests\TestCase;

class LaravelRequestFetcherTest extends TestCase
{
    protected function defineRoutes($router): void
    {
        $router->get('/', function () {
            return 'Hello!';
        });
    }

    public function testPsr7InstanceCanBeResolved(): void
    {
        // The request is only set on the container if we made a request (it is resolved by the SetRequestMiddleware)
        $this->get('/');

        $instance = $this->app->make(LaravelRequestFetcher::CONTAINER_PSR7_INSTANCE_KEY);

        $this->assertInstanceOf(ServerRequest::class, $instance);
    }
}
