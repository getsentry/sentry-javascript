<?php

namespace Sentry\Laravel\Tests;

use Orchestra\Testbench\TestCase;
use Sentry\Laravel\Facade;
use Sentry\Laravel\ServiceProvider;
use Sentry\State\HubInterface;

class ServiceProviderWithCustomAliasTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('custom-sentry.dsn', 'http://publickey@sentry.dev/123');
        $app['config']->set('custom-sentry.error_types', E_ALL ^ E_DEPRECATED ^ E_USER_DEPRECATED);
    }

    protected function getPackageProviders($app): array
    {
        return [
            CustomSentryServiceProvider::class,
        ];
    }

    protected function getPackageAliases($app): array
    {
        return [
            'CustomSentry' => CustomSentryFacade::class,
        ];
    }

    public function testIsBound(): void
    {
        $this->assertTrue(app()->bound('custom-sentry'));
        $this->assertInstanceOf(HubInterface::class, app('custom-sentry'));
        $this->assertSame(app('custom-sentry'), CustomSentryFacade::getFacadeRoot());
    }

    /**
     * @depends testIsBound
     */
    public function testEnvironment(): void
    {
        $this->assertEquals('testing', app('custom-sentry')->getClient()->getOptions()->getEnvironment());
    }

    /**
     * @depends testIsBound
     */
    public function testDsnWasSetFromConfig(): void
    {
        /** @var \Sentry\Options $options */
        $options = app('custom-sentry')->getClient()->getOptions();

        $this->assertEquals('http://sentry.dev', $options->getDsn()->getScheme() . '://' . $options->getDsn()->getHost());
        $this->assertEquals(123, $options->getDsn()->getProjectId());
        $this->assertEquals('publickey', $options->getDsn()->getPublicKey());
    }

    /**
     * @depends testIsBound
     */
    public function testErrorTypesWasSetFromConfig(): void
    {
        $this->assertEquals(
            E_ALL ^ E_DEPRECATED ^ E_USER_DEPRECATED,
            app('custom-sentry')->getClient()->getOptions()->getErrorTypes()
        );
    }
}

class CustomSentryServiceProvider extends ServiceProvider
{
    public static $abstract = 'custom-sentry';
}

class CustomSentryFacade extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'custom-sentry';
    }
}
