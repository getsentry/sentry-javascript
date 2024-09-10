<?php

namespace Sentry\Laravel\Tests\EventHandler;

use Illuminate\Console\Events\CommandStarting;
use Sentry\Laravel\Tests\TestCase;
use Symfony\Component\Console\Input\ArgvInput;
use Symfony\Component\Console\Output\BufferedOutput;

class ConsoleIntegrationTest extends TestCase
{
    public function testCommandBreadcrumbIsRecordedWhenEnabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.breadcrumbs.command_info' => true,
        ]);

        $this->assertTrue($this->app['config']->get('sentry.breadcrumbs.command_info'));

        $this->dispatchCommandStartEvent();

        $lastBreadcrumb = $this->getLastSentryBreadcrumb();

        $this->assertEquals('Starting Artisan command: test:command', $lastBreadcrumb->getMessage());
        $this->assertEquals('--foo=bar', $lastBreadcrumb->getMetadata()['input']);
    }

    public function testCommandBreadcrumIsNotRecordedWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.breadcrumbs.command_info' => false,
        ]);

        $this->assertFalse($this->app['config']->get('sentry.breadcrumbs.command_info'));

        $this->dispatchCommandStartEvent();

        $this->assertEmpty($this->getCurrentSentryBreadcrumbs());
    }

    private function dispatchCommandStartEvent(): void
    {
        $this->dispatchLaravelEvent(
            new CommandStarting(
                'test:command',
                new ArgvInput(['artisan', '--foo=bar']),
                new BufferedOutput()
            )
        );
    }
}
