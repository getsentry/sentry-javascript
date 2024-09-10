<?php

namespace Sentry\Laravel\Integration;

use Illuminate\Log\Context\Repository as ContextRepository;
use Sentry\Event;
use Sentry\EventHint;
use Sentry\EventType;
use Sentry\Integration\IntegrationInterface;
use Sentry\SentrySdk;
use Sentry\State\Scope;

class LaravelContextIntegration implements IntegrationInterface
{
    public function setupOnce(): void
    {
        // Context was introduced in Laravel 11 so we need to check if we can use it otherwise we skip the event processor
        if (!class_exists(ContextRepository::class)) {
            return;
        }

        Scope::addGlobalEventProcessor(static function (Event $event, ?EventHint $hint = null): Event {
            $self = SentrySdk::getCurrentHub()->getIntegration(self::class);

            if (!$self instanceof self) {
                return $event;
            }

            if (!in_array($event->getType(), [EventType::event(), EventType::transaction()], true)) {
                return $event;
            }

            $event->setContext('laravel', app(ContextRepository::class)->all());

            return $event;
        });
    }
}
