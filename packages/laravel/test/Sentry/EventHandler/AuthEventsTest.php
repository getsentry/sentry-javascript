<?php

namespace Sentry\EventHandler;

use Illuminate\Auth\Events\Authenticated;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use Sentry\Laravel\Tests\TestCase;

class AuthEventsTest extends TestCase
{
    protected $setupConfig = [
        'sentry.send_default_pii' => true,
    ];

    public function testAuthenticatedEventFillsUserOnScope(): void
    {
        $user = new AuthEventsTestUserModel();

        $user->id = 123;
        $user->username = 'username';
        $user->email = 'foo@example.com';

        $scope = $this->getCurrentSentryScope();

        $this->assertNull($scope->getUser());

        $this->dispatchLaravelEvent(new Authenticated('test', $user));

        $this->assertNotNull($scope->getUser());

        $this->assertEquals($scope->getUser()->getId(), 123);
        $this->assertEquals($scope->getUser()->getUsername(), 'username');
        $this->assertEquals($scope->getUser()->getEmail(), 'foo@example.com');
    }

    public function testAuthenticatedEventFillsUserOnScopeWhenUsernameIsNotAString(): void
    {
        $user = new AuthEventsTestUserModel();

        $user->id = 123;
        $user->username = 456;

        $scope = $this->getCurrentSentryScope();

        $this->assertNull($scope->getUser());

        $this->dispatchLaravelEvent(new Authenticated('test', $user));

        $this->assertNotNull($scope->getUser());

        $this->assertEquals($scope->getUser()->getId(), 123);
        $this->assertEquals($scope->getUser()->getUsername(), '456');
    }

    public function testAuthenticatedEventDoesNotFillUserOnScopeWhenPIIShouldNotBeSent(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.send_default_pii' => false,
        ]);

        $user = new AuthEventsTestUserModel();

        $user->id = 123;

        $scope = $this->getCurrentSentryScope();

        $this->assertNull($scope->getUser());

        $this->dispatchLaravelEvent(new Authenticated('test', $user));

        $this->assertNull($scope->getUser());
    }
}

class AuthEventsTestUserModel extends Model implements Authenticatable
{
    use \Illuminate\Auth\Authenticatable;
}
