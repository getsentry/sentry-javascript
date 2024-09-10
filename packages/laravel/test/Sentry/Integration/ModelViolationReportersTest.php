<?php

namespace Sentry\Integration;

use Illuminate\Database\Eloquent\MissingAttributeException;
use Illuminate\Database\Eloquent\Model;
use Sentry\Laravel\Integration;
use Sentry\Laravel\Tests\TestCase;

/**
 * Since large parts of the violation reporters are shared between the different types of violations,
 * we try to test only a single type of violation reporter to keep the test cases a bit smaller when possible.
 */
class ModelViolationReportersTest extends TestCase
{
    protected function setUp(): void
    {
        if (!class_exists(MissingAttributeException::class)) {
            $this->markTestSkipped('Laravel introduced model violations in version 9.');
        }

        parent::setUp();
    }

    public function testModelViolationReportersCanBeRegistered(): void
    {
        $this->expectNotToPerformAssertions();

        Model::handleLazyLoadingViolationUsing(Integration::lazyLoadingViolationReporter());
        Model::handleMissingAttributeViolationUsing(Integration::missingAttributeViolationReporter());
        Model::handleDiscardedAttributeViolationUsing(Integration::discardedAttributeViolationReporter());
    }

    public function testViolationReporterAcceptsSingleProperty(): void
    {
        $reporter = Integration::discardedAttributeViolationReporter(null, true, false);

        $reporter(new ViolationReporterTestModel, 'foo');

        $this->assertCount(1, $this->getCapturedSentryEvents());

        $violation = $this->getLastSentryEvent()->getContexts()['violation'];

        $this->assertSame('foo', $violation['attribute']);
        $this->assertSame('discarded_attribute', $violation['kind']);
        $this->assertSame(ViolationReporterTestModel::class, $violation['model']);
    }

    public function testViolationReporterAcceptsListOfProperties(): void
    {
        $reporter = Integration::discardedAttributeViolationReporter(null, true, false);

        $reporter(new ViolationReporterTestModel, ['foo', 'bar']);

        $this->assertCount(1, $this->getCapturedSentryEvents());

        $violation = $this->getLastSentryEvent()->getContexts()['violation'];

        $this->assertSame('foo, bar', $violation['attribute']);
        $this->assertSame('discarded_attribute', $violation['kind']);
        $this->assertSame(ViolationReporterTestModel::class, $violation['model']);
    }

    public function testViolationReporterPassesThroughToCallback(): void
    {
        $callbackCalled = false;

        $reporter = Integration::missingAttributeViolationReporter(static function () use (&$callbackCalled) {
            $callbackCalled = true;
        }, false, false);

        $reporter(new ViolationReporterTestModel, 'attribute');

        $this->assertTrue($callbackCalled);
    }

    public function testViolationReporterIsNotReportingDuplicateEvents(): void
    {
        $reporter = Integration::missingAttributeViolationReporter(null, true, false);

        $reporter(new ViolationReporterTestModel, 'attribute');
        $reporter(new ViolationReporterTestModel, 'attribute');

        $this->assertCount(1, $this->getCapturedSentryEvents());
    }

    public function testViolationReporterIsReportingDuplicateEventsIfConfigured(): void
    {
        $reporter = Integration::missingAttributeViolationReporter(null, false, false);

        $reporter(new ViolationReporterTestModel, 'attribute');
        $reporter(new ViolationReporterTestModel, 'attribute');

        $this->assertCount(2, $this->getCapturedSentryEvents());
    }
}

class ViolationReporterTestModel extends Model
{
}
