<?php

namespace Sentry;

use Sentry\Laravel\Tests\TestCase;

class ServiceProviderWithEnvironmentFromConfigTest extends TestCase
{
    public function testSentryEnvironmentDefaultsToLaravelEnvironment(): void
    {
        $this->assertEquals('testing', app()->environment());
    }

    public function testEmptySentryEnvironmentDefaultsToLaravelEnvironment(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.environment' => '',
        ]);

        $this->assertEquals('testing', $this->getSentryClientFromContainer()->getOptions()->getEnvironment());

        $this->resetApplicationWithConfig([
            'sentry.environment' => null,
        ]);

        $this->assertEquals('testing', $this->getSentryClientFromContainer()->getOptions()->getEnvironment());
    }

    public function testSentryEnvironmentDefaultGetsOverriddenByConfig(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.environment' => 'override_env',
        ]);

        $this->assertEquals('override_env', $this->getSentryClientFromContainer()->getOptions()->getEnvironment());
    }
}
