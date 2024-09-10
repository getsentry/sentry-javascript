<?php

namespace Sentry\Laravel\Tests\Laravel;

use Sentry\Laravel\Tests\TestCase;
use Sentry\Logger\DebugFileLogger;
use Sentry\State\HubInterface;

class LaravelContainerConfigOptionsTest extends TestCase
{
    public function testLoggerIsNullByDefault(): void
    {
        $logger = app(HubInterface::class)->getClient()->getOptions()->getLogger();

        $this->assertNull($logger);
    }

    public function testLoggerIsResolvedFromDefaultSingleton(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.logger' => DebugFileLogger::class,
        ]);

        $logger = app(HubInterface::class)->getClient()->getOptions()->getLogger();

        $this->assertInstanceOf(DebugFileLogger::class, $logger);
    }
}
