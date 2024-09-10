<?php

namespace Sentry\Laravel\Tests;

use Sentry\ClientBuilder;

class ClientBuilderDecoratorTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        $app->extend(ClientBuilder::class, function (ClientBuilder $clientBuilder) {
            $clientBuilder->getOptions()->setEnvironment('from_service_container');

            return $clientBuilder;
        });
    }

    public function testClientHasEnvironmentSetFromDecorator(): void
    {
        $this->assertEquals(
            'from_service_container',
            $this->getSentryClientFromContainer()->getOptions()->getEnvironment()
        );
    }
}
