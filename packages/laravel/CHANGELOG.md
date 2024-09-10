# Changelog

## 4.8.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.8.0.

### Bug Fixes

- Fix `php artisan sentry:publish` mangling the .env file [(#928)](https://github.com/getsentry/sentry-laravel/pull/928)

- Fix not (correctly) reporting transactions when using Laravel Octane [(#936)](https://github.com/getsentry/sentry-laravel/pull/936)

### Misc

- Improve the stacktrace of the `php artisan sentry:test` event [(#926)](https://github.com/getsentry/sentry-laravel/pull/926)

- Remove outdated JS SDK installation step from `php artisan sentry:publish` [(#930)](https://github.com/getsentry/sentry-laravel/pull/930)

## 4.7.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.7.1.

### Bug Fixes

- Always remove the `XSRF-TOKEN` cookie value before sending to Sentry [(#920)](https://github.com/getsentry/sentry-laravel/pull/920)
- Fix trace durations when using Octane [(#921)](https://github.com/getsentry/sentry-laravel/pull/921)
- Handle clousre route names [(#921)](https://github.com/getsentry/sentry-laravel/pull/921)
- Don't rely on facades when accessing the Laravel context [(#922)](https://github.com/getsentry/sentry-laravel/pull/922)
- Normalize array of cache key names before converting to string [(#923)](https://github.com/getsentry/sentry-laravel/pull/923)

## 4.7.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.7.0.

### Features

- Add support for Cache Insights Module [(#914)](https://github.com/getsentry/sentry-laravel/pull/914). To learn more about this module, visit https://docs.sentry.io/product/insights/caches/. This feature requires Laravel v11.11.0 or higher.

  Cache tracing is enabled by default for new SDK installations. To enable this feature in your existing installation, update your `config/sentry.php` file with `'cache' => env('SENTRY_TRACE_CACHE_ENABLED', true),` under `'tracing'`.

## 4.6.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.6.1.

### Bug Fixes

- Fix wrong queue grouping in the queue Insights Module [(#910)](https://github.com/getsentry/sentry-laravel/pull/910)

## 4.6.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.6.0.

### Features

- Add support for the Queue Insights Module [(#902)](https://github.com/getsentry/sentry-laravel/pull/902). To learn more about this module, visit https://docs.sentry.io/product/performance/queue-monitoring/.

  Queue tracing is enabled by default for new SDK installations. To enable this feature in your existing installation, update your `config/sentry.php` file with `'queue_jobs' => env('SENTRY_TRACE_QUEUE_JOBS_ENABLED', true),` or set `SENTRY_TRACE_QUEUE_JOBS_ENABLED=true` in your environment [(#903)](https://github.com/getsentry/sentry-laravel/pull/903)

### Bug Fixes

- Check if a span is sampled before creating child spans [(#898)](https://github.com/getsentry/sentry-laravel/pull/898)

- Always register the console `sentryMonitor()` macro. This fixes the macro not being available when using Laravel Lumen [(#900)](https://github.com/getsentry/sentry-laravel/pull/900)

- Avoid manipulating the config when resolving disks [(#901)](https://github.com/getsentry/sentry-laravel/pull/901)

### Misc

- Various Spotlight improvements, such as the addition of a new `SENTRY_SPOTLIGHT` environment variable and not requiring a DSN to be set to use Spotlight [(#892)](https://github.com/getsentry/sentry-laravel/pull/892)

## 4.5.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.5.1.

### Bug Fixes

- Fix discarded attribute violation reporter not accepting multiple property names [(#890)](https://github.com/getsentry/sentry-laravel/pull/890)

## 4.5.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.5.0.

### Features

- Limit when SQL query origins are being captured [(#881)](https://github.com/getsentry/sentry-laravel/pull/881)

  We now only capture the origin of a SQL query when the query is slower than 100ms, configurable by the `SENTRY_TRACE_SQL_ORIGIN_THRESHOLD_MS` environment variable.

- Add tracing and breadcrumbs for [Notifications](https://laravel.com/docs/11.x/notifications) [(#852)](https://github.com/getsentry/sentry-laravel/pull/852)

- Add reporter for `Model::preventAccessingMissingAttributes()` [(#824)](https://github.com/getsentry/sentry-laravel/pull/824)

- Make it easier to enable the debug logger [(#880)](https://github.com/getsentry/sentry-laravel/pull/880)

  You can now enable the debug logger by adding the following to your `config/sentry.php` file:

  ```php
  'logger' => Sentry\Logger\DebugFileLogger::class, // This will log SDK logs to `storage_path('logs/sentry.log')`
  ```
  
  Only use this in development and testing environments, as it can generate a lot of logs.

### Bug Fixes

- Fix Lighthouse operation not detected when query contained a fragment before the operation [(#883)](https://github.com/getsentry/sentry-laravel/pull/883)

- Fix an exception being thrown when the username extracted from the authenticated user model is not a string [(#887)](https://github.com/getsentry/sentry-laravel/pull/887)

## 4.4.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.4.1.

### Bug Fixes

- Fix `assertExists`/`assertMissing` can throw on the `FilesystemDecorator` [(#877)](https://github.com/getsentry/sentry-laravel/pull/877)

## 4.4.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.4.0.

### Features

- Add support for Laravel 11 Context [(#869)](https://github.com/getsentry/sentry-laravel/pull/869)

  If you are using Laravel 11 and the new "Context" capabilities we now automatically capture that context for you and it will be visible in Sentry.
  Read more about the feature in the [Laravel documentation](https://laravel.com/docs/11.x/context) and how to use it.


## 4.3.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.3.1.

### Bug Fixes

- Add missing methods to `FilesystemDecorator` [(#865)](https://github.com/getsentry/sentry-laravel/pull/865)

## 4.3.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.3.0.

### Features

- Add support for Laravel 11.0 [(#845)](https://github.com/getsentry/sentry-laravel/pull/845)

  If you're upgrading an existing Laravel 10 application to the new Laravel 11 directory structure, you must change how Sentry integrates into the exception handler. Update your `bootstrap/app.php` with:

  ```php
  <?php

  use Illuminate\Foundation\Application;
  use Illuminate\Foundation\Configuration\Exceptions;
  use Illuminate\Foundation\Configuration\Middleware;
  use Sentry\Laravel\Integration;
  
  return Application::configure(basePath: dirname(__DIR__))
      ->withRouting(
          web: __DIR__.'/../routes/web.php',
          commands: __DIR__.'/../routes/console.php',
          health: '/up',
      )
      ->withMiddleware(function (Middleware $middleware) {
          //
      })
      ->withExceptions(function (Exceptions $exceptions) {
          Integration::handles($exceptions);
      })->create();
    ```

  If you plan to perform up-time checks against the new Laravel 11 `/up` health URL, ignore this transaction in your `config/sentry.php` file, as not doing so could consume a substantial amount of your performance unit quota.

  ```php
  // @see: https://docs.sentry.io/platforms/php/guides/laravel/configuration/options/#ignore-transactions
  'ignore_transactions' => [
      // Ignore Laravel's default health URL
      '/up',
  ],
  ```

### Bug Fixes

- Set `queue.publish` spans as the parent of `queue.process` spans [(#850)](https://github.com/getsentry/sentry-laravel/pull/850)

- Consider all `http_*` SDK options from the Laravel client in the test command [(#859)](https://github.com/getsentry/sentry-laravel/pull/859)

## 4.2.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.2.0.

### Features

- Add new spans, measuring the time taken to queue a job [(#833)](https://github.com/getsentry/sentry-laravel/pull/833)

- Add support for `failure_issue_threshold` & `recovery_threshold` for `sentryMonitor()` method on scheduled commands [(#838)](https://github.com/getsentry/sentry-laravel/pull/838)

- Automatically flush metrics when the application terminates [(#841)](https://github.com/getsentry/sentry-laravel/pull/841)

- Add support for the W3C traceparent header [(#834)](https://github.com/getsentry/sentry-laravel/pull/834)

- Improve `php artisan sentry:test` to show internal log messages by default [(#842)](https://github.com/getsentry/sentry-laravel/pull/842)

## 4.1.2

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.1.2.

### Bug Fixes

- Fix unable to set `callable` for `integrations` option [(#826)](https://github.com/getsentry/sentry-laravel/pull/826)

- Fix performance traces not being collected for Laravel Lumen unless missing routes are reported [(#822)](https://github.com/getsentry/sentry-laravel/pull/822)

- Fix configuration options for queue job tracing not applying correctly [(#820)](https://github.com/getsentry/sentry-laravel/pull/820)

### Misc

- Allow newer versions of `symfony/psr-http-message-bridge` dependency [(#829)](https://github.com/getsentry/sentry-laravel/pull/829)

## 4.1.1

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.1.1.

### Bug Fixes

- Fix missing `sentryMonitor()` macro when command is called outside the CLI environment [(#812)](https://github.com/getsentry/sentry-laravel/pull/812)

- Don't call `terminating()` in Lumen apps below 9.1.4 [(#815)](https://github.com/getsentry/sentry-laravel/pull/815)

## 4.1.0

The Sentry SDK team is happy to announce the immediate availability of Sentry Laravel SDK v4.1.0.

### Features

- Capture SQL query bindings (parameters) in SQL query spans [(#804)](https://github.com/getsentry/sentry-laravel/pull/804)

  To enable this feature, update your `config/sentry.php` file or set the `SENTRY_TRACE_SQL_BINDINGS_ENABLED` environment variable to `true`.

  ```php
  'tracing' => [
      'sql_bindings' => true,
  ],
  ```

### Misc

- Unify backtrace origin span attributes [(#803)](https://github.com/getsentry/sentry-laravel/pull/803)
- Add `ignore_exceptions` & `ignore_transactions` to default config [(#802)](https://github.com/getsentry/sentry-laravel/pull/802)

## 4.0.0

The Sentry SDK team is thrilled to announce the immediate availability of Sentry Laravel SDK v4.0.0.

### Breaking Change

This version adds support for the underlying [Sentry PHP SDK v4.0](https://github.com/getsentry/sentry-php).
Please refer to the PHP SDK [sentry-php/UPGRADE-4.0.md](https://github.com/getsentry/sentry-php/blob/master/UPGRADE-4.0.md) guide for a complete list of breaking changes.

- This version exclusively uses the [envelope endpoint](https://develop.sentry.dev/sdk/envelopes/) to send event data to Sentry.

  If you are using [sentry.io](https://sentry.io), no action is needed.
  If you are using an on-premise/self-hosted installation of Sentry, the minimum requirement is now version `>= v20.6.0`.

- You need to have `ext-curl` installed to use the SDK.

- The `IgnoreErrorsIntegration` integration was removed. Use the `ignore_exceptions` option instead.

  ```php
  // config/sentry.php

  'ignore_exceptions' => [BadThingsHappenedException::class],
  ```

  This option performs an [`is_a`](https://www.php.net/manual/en/function.is-a.php) check now, so you can also ignore more generic exceptions.

### Features

- Enable distributed tracing for outgoing HTTP client requests [(#797)](https://github.com/getsentry/sentry-laravel/pull/797)

  This feature is only available on Laravel >= 10.14.
  When making a request using the Laravel `Http` facade, we automatically attach the `sentry-trace` and `baggage` headers.

  This behaviour can be controlled by setting `trace_propagation_targets` in your `config/sentry.php` file.

  ```php
  // config/sentry.php

  // All requests will contain the tracing headers. This is the default behaviour.
  'trace_propagation_targets' => null,

  // To turn this feature off completely, set the option to an empty array.
  'trace_propagation_targets' => [],

  // To only attach these headers to some requests, you can allow-list certain hosts.
  'trace_propagation_targets' => [
      'examlpe.com',
      'api.examlpe.com',
  ],
  ```

  Please make sure to remove any custom code that injected these headers previously.
  If you are using the `Sentry\Tracing\GuzzleTracingMiddleware` provided by our underlying PHP SDK, you must also remove it.

- Add support for Laravel Livewire 3 [(#798)](https://github.com/getsentry/sentry-laravel/pull/798)

  The SDK now creates traces and breadcrumbs for Livewire 3 as well.
  Both the class-based and Volt usage are supported.

  ```php
  // config/sentry.php

  'breadcrumbs' => [
      // Capture Livewire components in breadcrumbs
      'livewire' => true,
  ],
  'tracing' => [
      // Capture Livewire components as spans
      'livewire' => true,
  ],
  ```

- Add new fluent APIs [(#1601)](https://github.com/getsentry/sentry-php/pull/1601)

  ```php
  // Before
  $spanContext = new SpanContext();
  $spanContext->setDescription('myFunction');
  $spanContext->setOp('function');

  // After
  $spanContext = (new SpanContext())
      ->setDescription('myFunction');
      ->setOp('function');
  ```

- Simplify the breadcrumb API [(#1603)](https://github.com/getsentry/sentry-php/pull/1603)

  ```php
  // Before
  \Sentry\addBreadcrumb(
      new \Sentry\Breadcrumb(
          \Sentry\Breadcrumb::LEVEL_INFO,
          \Sentry\Breadcrumb::TYPE_DEFAULT,
          'auth',                // category
          'User authenticated',  // message (optional)
          ['user_id' => $userId] // data (optional)
      )
  );

  // After
  \Sentry\addBreadcrumb(
      category: 'auth',
      message: 'User authenticated', // optional
      metadata: ['user_id' => $userId], // optional
      level: Breadcrumb::LEVEL_INFO, // set by default
      type: Breadcrumb::TYPE_DEFAULT, // set by default
  );
  ```

- New default cURL HTTP client [(#1589)](https://github.com/getsentry/sentry-php/pull/1589)

### Misc

- The abandoned package `php-http/message-factory` was removed.
