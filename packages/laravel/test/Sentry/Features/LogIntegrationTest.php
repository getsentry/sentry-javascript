<?php

namespace Sentry\Features;

use Illuminate\Config\Repository;
use Illuminate\Support\Facades\Log;
use Sentry\Laravel\Tests\TestCase;
use Sentry\Severity;

class LogIntegrationTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        tap($app['config'], static function (Repository $config) {
            $config->set('logging.channels.sentry', [
                'driver' => 'sentry',
            ]);

            $config->set('logging.channels.sentry_error_level', [
                'driver' => 'sentry',
                'level' => 'error',
            ]);
        });
    }

    public function testLogChannelIsRegistered(): void
    {
        $this->expectNotToPerformAssertions();

        Log::channel('sentry');
    }

    /** @define-env envWithoutDsnSet */
    public function testLogChannelIsRegisteredWithoutDsn(): void
    {
        $this->expectNotToPerformAssertions();

        Log::channel('sentry');
    }

    public function testLogChannelGeneratesEvents(): void
    {
        $logger = Log::channel('sentry');

        $logger->info('Sentry Laravel info log message');

        $this->assertSentryEventCount(1);

        $event = $this->getLastSentryEvent();

        $this->assertEquals(Severity::info(), $event->getLevel());
        $this->assertEquals('Sentry Laravel info log message', $event->getMessage());
    }

    public function testLogChannelGeneratesEventsOnlyForConfiguredLevel(): void
    {
        $logger = Log::channel('sentry_error_level');

        $logger->info('Sentry Laravel info log message');
        $logger->warning('Sentry Laravel warning log message');
        $logger->error('Sentry Laravel error log message');

        $this->assertSentryEventCount(1);

        $event = $this->getLastSentryEvent();

        $this->assertEquals(Severity::error(), $event->getLevel());
        $this->assertEquals('Sentry Laravel error log message', $event->getMessage());
    }
}
