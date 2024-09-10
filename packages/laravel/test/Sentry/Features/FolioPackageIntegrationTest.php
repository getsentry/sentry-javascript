<?php

namespace Sentry\Features;

use Laravel\Folio\Folio;
use Sentry\EventType;
use Sentry\Laravel\Integration;
use Illuminate\Config\Repository;
use Sentry\Laravel\Tests\TestCase;
use Illuminate\Database\Eloquent\Model;

class FolioPackageIntegrationTest extends TestCase
{
    protected function setUp(): void
    {
        if (!class_exists(Folio::class)) {
            $this->markTestSkipped('Laravel Folio package is not installed.');
        }

        parent::setUp();
    }

    protected function defineRoutes($router): void
    {
        $folioStubPath = __DIR__ . '/../../stubs/folio';

        Folio::route($folioStubPath);

        Folio::path($folioStubPath)->uri('/folio');
    }

    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        tap($app['config'], static function (Repository $config) {
            // This is done to prevent noise from the database queries in the breadcrumbs
            $config->set('sentry.breadcrumbs.sql_queries', false);

            $config->set('database.default', 'inmemory');
            $config->set('database.connections.inmemory', [
                'driver' => 'sqlite',
                'database' => ':memory:',
            ]);
        });
    }

    protected function defineDatabaseMigrations(): void
    {
        $this->loadLaravelMigrations();
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioCatchAllRouteCreatesTransaction(): void
    {
        $this->get('/')->assertOk();

        $this->assertSentryTransactionCount(1);

        $transaction = $this->getLastSentryEvent();

        $this->assertEquals('/index', $transaction->getTransaction());
        $this->assertEquals(EventType::transaction(), $transaction->getType());
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioCatchAllRouteWithoutHandlerDropsTransaction(): void
    {
        $this->get('/non-existing-route')->assertNotFound();

        $this->assertSentryTransactionCount(0);
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioCatchAllRouteThrowingNotFoundDropsTransaction(): void
    {
        $this->get('/user/420')->assertNotFound();

        // Unfortunately it's not possible to detect a matching route since the Folio router bails early
        // So even though the `/user/[id].blade.php` view exists we can't detect it and thus drop the transaction
        $this->assertSentryTransactionCount(0);
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioPathRouteCreatesTransaction(): void
    {
        $this->get('/folio')->assertOk();

        $this->assertSentryTransactionCount(1);

        $transaction = $this->getLastSentryEvent();

        $this->assertEquals('/folio/index', $transaction->getTransaction());
        $this->assertEquals(EventType::transaction(), $transaction->getType());
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioPathRouteWithoutHandlerDropsTransaction(): void
    {
        $this->get('/folio/non-existing-route')->assertNotFound();

        $this->assertSentryTransactionCount(0);
    }

    /** @define-env envSamplingAllTransactions */
    public function testFolioPathRouteThrowingNotFoundDropsTransaction(): void
    {
        $this->get('/folio/user/420')->assertNotFound();

        // Unfortunately it's not possible to detect a matching route since the Folio router bails early
        // So even though the `/user/[id].blade.php` view exists we can't detect it and thus drop the transaction
        $this->assertSentryTransactionCount(0);
    }

    public function testFolioBreadcrumbIsRecorded(): void
    {
        $this->get('/folio');

        $this->assertCount(1, $this->getCurrentSentryBreadcrumbs());

        $lastBreadcrumb = $this->getLastSentryBreadcrumb();

        $this->assertEquals('folio.route', $lastBreadcrumb->getCategory());
        $this->assertEquals('navigation', $lastBreadcrumb->getType());
        $this->assertEquals('/folio/index', $lastBreadcrumb->getMessage());
    }

    public function testFolioRouteUpdatesIntegrationTransaction(): void
    {
        $this->get('/folio/post/123')->assertOk();

        $this->assertEquals('/folio/post/{id}', Integration::getTransaction());
    }

    public function testFolioRouteUpdatesPerformanceTransaction(): void
    {
        $transaction = $this->startTransaction();

        $this->get('/folio/post/123')->assertOk();

        $this->assertEquals('/folio/post/{id}', $transaction->getName());
    }

    public function testFolioTransactionNameForRouteWithSingleSegmentParamater(): void
    {
        $this->get('/folio/post/123')->assertOk();

        $this->assertEquals('/folio/post/{id}', Integration::getTransaction());
    }

    public function testFolioTransactionNameForRouteWithMultipleSegmentParameter(): void
    {
        $this->get('/folio/posts/1/2/3')->assertOk();

        $this->assertEquals('/folio/posts/{...ids}', Integration::getTransaction());
    }

    public function testFolioTransactionNameForRouteWithRouteModelBoundSegmentParameter(): void
    {
        $user = FolioPackageIntegrationUserModel::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => 'secret',
        ]);

        $this->get("/folio/user/{$user->id}")->assertOk();

        // This looks a little odd, but that is because we want to make the route model binding work in our tests
        // normally this would look like `/folio/user/{User}` instead, see: https://laravel.com/docs/10.x/folio#route-model-binding.
        $this->assertEquals('/folio/user/{.Sentry.Features.FolioPackageIntegrationUserModel}', Integration::getTransaction());
    }
}

class FolioPackageIntegrationUserModel extends Model
{
    protected $table = 'users';
    protected $guarded = false;
}
