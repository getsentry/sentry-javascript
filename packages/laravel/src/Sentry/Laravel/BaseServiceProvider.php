<?php

namespace Sentry\Laravel;

use Illuminate\Support\ServiceProvider;

abstract class BaseServiceProvider extends ServiceProvider
{
    /**
     * Abstract type to bind Sentry as in the Service Container.
     *
     * @var string
     */
    public static $abstract = 'sentry';

    /**
     * Check if a DSN was set in the config.
     *
     * @return bool
     */
    protected function hasDsnSet(): bool
    {
        $config = $this->getUserConfig();

        return !empty($config['dsn']);
    }

    /**
     * Check if Spotlight was enabled in the config.
     *
     * @return bool
     */
    protected function hasSpotlightEnabled(): bool
    {
        $config = $this->getUserConfig();

        return ($config['spotlight'] ?? false) === true;
    }

    /**
     * Retrieve the user configuration.
     *
     * @return array
     */
    protected function getUserConfig(): array
    {
        $config = $this->app['config'][static::$abstract];

        return empty($config) ? [] : $config;
    }

    /**
     * Checks if the config is set in such a way that performance tracing could be enabled.
     *
     * Because of `traces_sampler` being dynamic we can never be 100% confident but that is also not important.
     *
     * @deprecated since version 4.6. To be removed in version 5.0.
     *
     * @return bool
     */
    protected function couldHavePerformanceTracingEnabled(): bool
    {
        $config = $this->getUserConfig();

        return !empty($config['traces_sample_rate']) || !empty($config['traces_sampler']) || ($config['spotlight'] ?? false) === true;
    }
}
