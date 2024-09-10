<?php

namespace Sentry\Laravel\Tests\EventHandler;

use Illuminate\Log\Events\MessageLogged;
use Sentry\Laravel\Tests\TestCase;

class LogEventsTest extends TestCase
{
    public function testLaravelLogsAreRecordedWhenEnabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.breadcrumbs.logs' => true,
        ]);

        $this->assertTrue($this->app['config']->get('sentry.breadcrumbs.logs'));

        $this->dispatchLaravelEvent(new MessageLogged(
            $level = 'debug',
            $message = 'test message',
            $context = ['1']
        ));

        $lastBreadcrumb = $this->getLastSentryBreadcrumb();

        $this->assertEquals($level, $lastBreadcrumb->getLevel());
        $this->assertEquals($message, $lastBreadcrumb->getMessage());
        $this->assertEquals($context, $lastBreadcrumb->getMetadata());
    }

    public function testLaravelLogsAreRecordedWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.breadcrumbs.logs' => false,
        ]);

        $this->assertFalse($this->app['config']->get('sentry.breadcrumbs.logs'));

        $this->dispatchLaravelEvent(new MessageLogged('debug', 'test message'));

        $this->assertEmpty($this->getCurrentSentryBreadcrumbs());
    }
}
