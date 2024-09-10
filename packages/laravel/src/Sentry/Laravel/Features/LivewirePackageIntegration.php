<?php

namespace Sentry\Laravel\Features;

use Livewire\Component;
use Livewire\EventBus;
use Livewire\LivewireManager;
use Livewire\Request;
use Sentry\Breadcrumb;
use Sentry\Laravel\Features\Concerns\TracksPushedScopesAndSpans;
use Sentry\Laravel\Integration;
use Sentry\SentrySdk;
use Sentry\Tracing\SpanContext;
use Sentry\Tracing\TransactionSource;

class LivewirePackageIntegration extends Feature
{
    use TracksPushedScopesAndSpans;

    private const FEATURE_KEY = 'livewire';

    public function isApplicable(): bool
    {
        if (!class_exists(LivewireManager::class)) {
            return false;
        }

        return $this->isTracingFeatureEnabled(self::FEATURE_KEY)
            || $this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY);
    }

    public function onBoot(LivewireManager $livewireManager): void
    {
        if (class_exists(EventBus::class)) {
            $this->registerLivewireThreeEventListeners($livewireManager);

            return;
        }

        $this->registerLivewireTwoEventListeners($livewireManager);
    }

    private function registerLivewireThreeEventListeners(LivewireManager $livewireManager): void
    {
        $livewireManager->listen('mount', function (Component $component, array $data) {
            if ($this->isTracingFeatureEnabled(self::FEATURE_KEY)) {
                $this->handleComponentBoot($component);
            }

            if ($this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY)) {
                $this->handleComponentMount($component, $data);
            }
        });

        $livewireManager->listen('hydrate', function (Component $component) {
            if ($this->isTracingFeatureEnabled(self::FEATURE_KEY)) {
                $this->handleComponentBoot($component);
            }

            if ($this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY)) {
                $this->handleComponentHydrate($component);
            }
        });

        if ($this->isTracingFeatureEnabled(self::FEATURE_KEY)) {
            $livewireManager->listen('dehydrate', [$this, 'handleComponentDehydrate']);
        }

        if ($this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY)) {
            $livewireManager->listen('call', [$this, 'handleComponentCall']);
        }
    }

    private function registerLivewireTwoEventListeners(LivewireManager $livewireManager): void
    {
        $livewireManager->listen('component.booted', [$this, 'handleComponentBooted']);

        if ($this->isTracingFeatureEnabled(self::FEATURE_KEY)) {
            $livewireManager->listen('component.boot', function ($component) {
                $this->handleComponentBoot($component);
            });

            $livewireManager->listen('component.dehydrate', [$this, 'handleComponentDehydrate']);
        }

        if ($this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY)) {
            $livewireManager->listen('component.mount', [$this, 'handleComponentMount']);
        }
    }

    public function handleComponentCall(Component $component, string $method, array $arguments): void
    {
        Integration::addBreadcrumb(new Breadcrumb(
            Breadcrumb::LEVEL_INFO,
            Breadcrumb::TYPE_DEFAULT,
            'livewire',
            "Component call: {$component->getName()}::{$method}",
            $this->mapCallArgumentsToMethodParameters($component, $method, $arguments) ?? ['arguments' => $arguments]
        ));
    }

    public function handleComponentBoot(Component $component, ?string $method = null): void
    {
        if ($this->isLivewireRequest()) {
            $this->updateTransactionName($component->getName());
        }

        $parentSpan = SentrySdk::getCurrentHub()->getSpan();

        // If there is no sampled span there is no need to handle the event
        if ($parentSpan === null || !$parentSpan->getSampled()) {
            return;
        }

        $this->pushSpan(
            $parentSpan->startChild(
                SpanContext::make()
                    ->setOp('ui.livewire.component')
                    ->setOrigin('auto.laravel.livewire')
                    ->setDescription(
                        empty($method)
                            ? $component->getName()
                            : "{$component->getName()}::{$method}"
                    )
            )
        );
    }

    public function handleComponentMount(Component $component, array $data): void
    {
        Integration::addBreadcrumb(new Breadcrumb(
            Breadcrumb::LEVEL_INFO,
            Breadcrumb::TYPE_DEFAULT,
            'livewire',
            "Component mount: {$component->getName()}",
            $data
        ));
    }

    public function handleComponentBooted(Component $component, Request $request): void
    {
        if (!$this->isLivewireRequest()) {
            return;
        }

        if ($this->isBreadcrumbFeatureEnabled(self::FEATURE_KEY)) {
            Integration::addBreadcrumb(new Breadcrumb(
                Breadcrumb::LEVEL_INFO,
                Breadcrumb::TYPE_DEFAULT,
                'livewire',
                "Component booted: {$component->getName()}",
                ['updates' => $request->updates]
            ));
        }

        if ($this->isTracingFeatureEnabled(self::FEATURE_KEY)) {
            $this->updateTransactionName($component->getName());
        }
    }

    public function handleComponentHydrate(Component $component): void
    {
        Integration::addBreadcrumb(new Breadcrumb(
            Breadcrumb::LEVEL_INFO,
            Breadcrumb::TYPE_DEFAULT,
            'livewire',
            "Component hydrate: {$component->getName()}",
            $component->all()
        ));
    }

    public function handleComponentDehydrate(Component $component): void
    {
        $span = $this->maybeFinishSpan();
    }

    private function updateTransactionName(string $componentName): void
    {
        $transaction = SentrySdk::getCurrentHub()->getTransaction();

        if ($transaction === null) {
            return;
        }

        $transactionName = "livewire?component={$componentName}";

        $transaction->setName($transactionName);
        $transaction->getMetadata()->setSource(TransactionSource::custom());

        Integration::setTransaction($transactionName);
    }

    private function isLivewireRequest(): bool
    {
        try {
            /** @var \Illuminate\Http\Request $request */
            $request = $this->container()->make('request');

            if ($request === null) {
                return false;
            }

            return $request->hasHeader('x-livewire');
        } catch (\Throwable $e) {
            // If the request cannot be resolved, it's probably not a Livewire request.
            return false;
        }
    }

    private function mapCallArgumentsToMethodParameters(Component $component, string $method, array $data): ?array
    {
        // If the data is empty there is nothing to do and we can return early
        // We also do a quick sanity check the method exists to prevent doing more expensive reflection to come to the same conclusion
        if (empty($data) || !method_exists($component, $method)) {
            return null;
        }

        try {
            $reflection = new \ReflectionMethod($component, $method);
            $parameters = [];

            foreach ($reflection->getParameters() as $parameter) {
                $defaultValue = $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : '<missing>';

                $parameters["\${$parameter->getName()}"] = $data[$parameter->getPosition()] ?? $defaultValue;

                unset($data[$parameter->getPosition()]);
            }

            if (!empty($data)) {
                $parameters['additionalArguments'] = $data;
            }

            return $parameters;
        } catch (\ReflectionException $e) {
            // If reflection fails, fail the mapping instead of crashing
            return null;
        }
    }
}
