<?php

namespace Sentry\Laravel\Tests\Features;

use Illuminate\Support\Facades\Storage;
use Sentry\Laravel\Features\Storage\Integration;
use Sentry\Laravel\Tests\TestCase;

class StorageIntegrationTest extends TestCase
{
    public function testCreatesSpansFor(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks')),
        ]);

        $transaction = $this->startTransaction();

        Storage::put('foo', 'bar');
        $fooContent = Storage::get('foo');
        Storage::assertExists('foo', 'bar');
        Storage::delete('foo');
        Storage::delete(['foo', 'bar']);
        Storage::files();
        Storage::assertMissing(['foo', 'bar']);

        $spans = $transaction->getSpanRecorder()->getSpans();

        $this->assertArrayHasKey(1, $spans);
        $span = $spans[1];
        $this->assertSame('file.put', $span->getOp());
        $this->assertSame('foo (3 B)', $span->getDescription());
        $this->assertSame(['path' => 'foo', 'options' => [], 'disk' => 'local', 'driver' => 'local'], $span->getData());

        $this->assertArrayHasKey(2, $spans);
        $span = $spans[2];
        $this->assertSame('file.get', $span->getOp());
        $this->assertSame('foo', $span->getDescription());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getData());
        $this->assertSame('bar', $fooContent);

        $this->assertArrayHasKey(3, $spans);
        $span = $spans[3];
        $this->assertSame('file.assertExists', $span->getOp());
        $this->assertSame('foo', $span->getDescription());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getData());

        $this->assertArrayHasKey(4, $spans);
        $span = $spans[4];
        $this->assertSame('file.delete', $span->getOp());
        $this->assertSame('foo', $span->getDescription());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getData());

        $this->assertArrayHasKey(5, $spans);
        $span = $spans[5];
        $this->assertSame('file.delete', $span->getOp());
        $this->assertSame('2 paths', $span->getDescription());
        $this->assertSame(['paths' => ['foo', 'bar'], 'disk' => 'local', 'driver' => 'local'], $span->getData());

        $this->assertArrayHasKey(6, $spans);
        $span = $spans[6];
        $this->assertSame('file.files', $span->getOp());
        $this->assertNull($span->getDescription());
        $this->assertSame(['directory' => null, 'recursive' => false, 'disk' => 'local', 'driver' => 'local'], $span->getData());

        $this->assertArrayHasKey(7, $spans);
        $span = $spans[7];
        $this->assertSame('file.assertMissing', $span->getOp());
        $this->assertSame('2 paths', $span->getDescription());
        $this->assertSame(['paths' => ['foo', 'bar'], 'disk' => 'local', 'driver' => 'local'], $span->getData());
    }

    public function testDoesntCreateSpansWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks'), false),
        ]);

        $transaction = $this->startTransaction();

        Storage::exists('foo');

        $this->assertCount(1, $transaction->getSpanRecorder()->getSpans());
    }

    public function testCreatesBreadcrumbsFor(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks')),
        ]);

        Storage::put('foo', 'bar');
        $fooContent = Storage::get('foo');
        Storage::assertExists('foo', 'bar');
        Storage::delete('foo');
        Storage::delete(['foo', 'bar']);
        Storage::files();

        $breadcrumbs = $this->getCurrentSentryBreadcrumbs();

        $this->assertArrayHasKey(0, $breadcrumbs);
        $span = $breadcrumbs[0];
        $this->assertSame('file.put', $span->getCategory());
        $this->assertSame('foo (3 B)', $span->getMessage());
        $this->assertSame(['path' => 'foo', 'options' => [], 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());

        $this->assertArrayHasKey(1, $breadcrumbs);
        $span = $breadcrumbs[1];
        $this->assertSame('file.get', $span->getCategory());
        $this->assertSame('foo', $span->getMessage());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());
        $this->assertSame('bar', $fooContent);

        $this->assertArrayHasKey(2, $breadcrumbs);
        $span = $breadcrumbs[2];
        $this->assertSame('file.assertExists', $span->getCategory());
        $this->assertSame('foo', $span->getMessage());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());

        $this->assertArrayHasKey(3, $breadcrumbs);
        $span = $breadcrumbs[3];
        $this->assertSame('file.delete', $span->getCategory());
        $this->assertSame('foo', $span->getMessage());
        $this->assertSame(['path' => 'foo', 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());

        $this->assertArrayHasKey(4, $breadcrumbs);
        $span = $breadcrumbs[4];
        $this->assertSame('file.delete', $span->getCategory());
        $this->assertSame('2 paths', $span->getMessage());
        $this->assertSame(['paths' => ['foo', 'bar'], 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());

        $this->assertArrayHasKey(5, $breadcrumbs);
        $span = $breadcrumbs[5];
        $this->assertSame('file.files', $span->getCategory());
        $this->assertNull($span->getMessage());
        $this->assertSame(['directory' => null, 'recursive' => false, 'disk' => 'local', 'driver' => 'local'], $span->getMetadata());
    }

    public function testDoesntCreateBreadcrumbsWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks'), true, false),
        ]);

        Storage::exists('foo');

        $this->assertCount(0, $this->getCurrentSentryBreadcrumbs());
    }

    public function testDriverWorksWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.dsn' => null,
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks')),
        ]);

        Storage::exists('foo');

        $this->expectNotToPerformAssertions();
    }

    public function testResolvingDiskDoesNotModifyConfig(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks' => Integration::configureDisks(config('filesystems.disks')),
        ]);

        $originalConfig = config('filesystems.disks.local');

        Storage::disk('local');

        $this->assertEquals($originalConfig, config('filesystems.disks.local'));
    }

    public function testThrowsIfDiskConfigurationDoesntSpecifyDiskName(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks.local.driver' => 'sentry',
            'filesystems.disks.local.sentry_original_driver' => 'local',
        ]);

        $this->expectExceptionMessage('Missing `sentry_disk_name` config key for `sentry` filesystem driver.');

        Storage::disk('local');
    }

    public function testThrowsIfDiskConfigurationDoesntSpecifyOriginalDriver(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks.local.driver' => 'sentry',
            'filesystems.disks.local.sentry_disk_name' => 'local',
        ]);

        $this->expectExceptionMessage('Missing `sentry_original_driver` config key for `sentry` filesystem driver.');

        Storage::disk('local');
    }

    public function testThrowsIfDiskConfigurationCreatesCircularReference(): void
    {
        $this->resetApplicationWithConfig([
            'filesystems.disks.local.driver' => 'sentry',
            'filesystems.disks.local.sentry_disk_name' => 'local',
            'filesystems.disks.local.sentry_original_driver' => 'sentry',
        ]);

        $this->expectExceptionMessage('`sentry_original_driver` for Sentry storage integration cannot be the `sentry` driver.');

        Storage::disk('local');
    }
}
