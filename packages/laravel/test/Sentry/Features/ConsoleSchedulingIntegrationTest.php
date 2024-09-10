<?php

namespace Sentry\Features;

use DateTimeZone;
use Illuminate\Console\Scheduling\Schedule;
use RuntimeException;
use Sentry\Laravel\Tests\TestCase;
use Illuminate\Console\Scheduling\Event;

class ConsoleSchedulingIntegrationTest extends TestCase
{
    public function testScheduleMacro(): void
    {
        /** @var Event $scheduledEvent */
        $scheduledEvent = $this->getScheduler()
            ->call(function () {})
            ->sentryMonitor('test-monitor');

        $scheduledEvent->run($this->app);

        // We expect a total of 2 events to be sent to Sentry:
        // 1. The start check-in event
        // 2. The finish check-in event
        $this->assertSentryCheckInCount(2);

        $finishCheckInEvent = $this->getLastSentryEvent();

        $this->assertNotNull($finishCheckInEvent->getCheckIn());
        $this->assertEquals('test-monitor', $finishCheckInEvent->getCheckIn()->getMonitorSlug());
    }

    /**
     * When a timezone was defined on a command this would fail with:
     * Sentry\MonitorConfig::__construct(): Argument #4 ($timezone) must be of type ?string, DateTimeZone given
     * This test ensures that the timezone is properly converted to a string as expected.
     */
    public function testScheduleMacroWithTimeZone(): void
    {
        $expectedTimezone = 'UTC';

        /** @var Event $scheduledEvent */
        $scheduledEvent = $this->getScheduler()
            ->call(function () {})
            ->timezone(new DateTimeZone($expectedTimezone))
            ->sentryMonitor('test-timezone-monitor');

        $scheduledEvent->run($this->app);

        // We expect a total of 2 events to be sent to Sentry:
        // 1. The start check-in event
        // 2. The finish check-in event
        $this->assertSentryCheckInCount(2);

        $finishCheckInEvent = $this->getLastSentryEvent();

        $this->assertNotNull($finishCheckInEvent->getCheckIn());
        $this->assertEquals($expectedTimezone, $finishCheckInEvent->getCheckIn()->getMonitorConfig()->getTimezone());
    }

    public function testScheduleMacroAutomaticSlug(): void
    {
        /** @var Event $scheduledEvent */
        $scheduledEvent = $this->getScheduler()->command('inspire')->sentryMonitor();

        $scheduledEvent->run($this->app);

        // We expect a total of 2 events to be sent to Sentry:
        // 1. The start check-in event
        // 2. The finish check-in event
        $this->assertSentryCheckInCount(2);

        $finishCheckInEvent = $this->getLastSentryEvent();

        $this->assertNotNull($finishCheckInEvent->getCheckIn());
        $this->assertEquals('scheduled_artisan-inspire', $finishCheckInEvent->getCheckIn()->getMonitorSlug());
    }

    public function testScheduleMacroWithoutSlugOrCommandName(): void
    {
        $this->expectException(RuntimeException::class);

        $this->getScheduler()->call(function () {})->sentryMonitor();
    }

    /** @define-env envWithoutDsnSet */
    public function testScheduleMacroWithoutDsnSet(): void
    {
        /** @var Event $scheduledEvent */
        $scheduledEvent = $this->getScheduler()->call(function () {})->sentryMonitor('test-monitor');

        $scheduledEvent->run($this->app);

        $this->assertSentryCheckInCount(0);
    }

    public function testScheduleMacroIsRegistered(): void
    {
        if (!method_exists(Event::class, 'flushMacros')) {
            $this->markTestSkipped('Macroable::flushMacros() is not available in this Laravel version.');
        }

        Event::flushMacros();

        $this->refreshApplication();

        $this->assertTrue(Event::hasMacro('sentryMonitor'));
    }

    /** @define-env envWithoutDsnSet */
    public function testScheduleMacroIsRegisteredWithoutDsnSet(): void
    {
        if (!method_exists(Event::class, 'flushMacros')) {
            $this->markTestSkipped('Macroable::flushMacros() is not available in this Laravel version.');
        }

        Event::flushMacros();

        $this->refreshApplication();

        $this->assertTrue(Event::hasMacro('sentryMonitor'));
    }

    private function getScheduler(): Schedule
    {
        return $this->app->make(Schedule::class);
    }
}
