<?php

namespace Sentry\Laravel\Tests\Features;

use GuzzleHttp\Psr7\Request as PsrRequest;
use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Http\Client\Events\ResponseReceived;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Sentry\Laravel\Tests\TestCase;
use Sentry\Tracing\SpanStatus;

class HttpClientIntegrationTest extends TestCase
{
    protected function setUp(): void
    {
        if (!class_exists(ResponseReceived::class)) {
            $this->markTestSkipped('The Laravel HTTP client events are only available in Laravel 8.0+');
        }

        parent::setUp();
    }

    public function testHttpClientBreadcrumbIsRecordedForResponseReceivedEvent(): void
    {
        $this->dispatchLaravelEvent(new ResponseReceived(
            new Request(new PsrRequest('GET', 'https://example.com', [], 'request')),
            new Response(new PsrResponse(200, [], 'response'))
        ));

        $this->assertCount(1, $this->getCurrentSentryBreadcrumbs());

        $metadata = $this->getLastSentryBreadcrumb()->getMetadata();

        $this->assertEquals('GET', $metadata['http.request.method']);
        $this->assertEquals('https://example.com', $metadata['url']);
        $this->assertEquals(200, $metadata['http.response.status_code']);
        $this->assertEquals(7, $metadata['http.request.body.size']);
        $this->assertEquals(8, $metadata['http.response.body.size']);
    }

    public function testHttpClientBreadcrumbDoesntConsumeBodyStream(): void
    {
        $this->dispatchLaravelEvent(new ResponseReceived(
            $request = new Request(new PsrRequest('GET', 'https://example.com', [], 'request')),
            $response = new Response(new PsrResponse(200, [], 'response'))
        ));

        $this->assertCount(1, $this->getCurrentSentryBreadcrumbs());

        $this->assertEquals('request', $request->toPsrRequest()->getBody()->getContents());
        $this->assertEquals('response', $response->toPsrResponse()->getBody()->getContents());
    }

    public function testHttpClientBreadcrumbIsNotRecordedWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.breadcrumbs.http_client_requests' => false,
        ]);

        $this->dispatchLaravelEvent(new ResponseReceived(
            new Request(new PsrRequest('GET', 'https://example.com', [], 'request')),
            new Response(new PsrResponse(200, [], 'response'))
        ));

        $this->assertEmpty($this->getCurrentSentryBreadcrumbs());
    }

    public function testHttpClientSpanIsRecorded(): void
    {
        $transaction = $this->startTransaction();

        $client = Http::fake();

        $client->get('https://example.com');

        /** @var \Sentry\Tracing\Span $span */
        $span = last($transaction->getSpanRecorder()->getSpans());

        $this->assertEquals('http.client', $span->getOp());
        $this->assertEquals('GET https://example.com', $span->getDescription());
    }

    public function testHttpClientSpanIsRecordedWithCorrectResult(): void
    {
        $transaction = $this->startTransaction();

        $client = Http::fake([
            'example.com/success' => Http::response('OK'),
            'example.com/error' => Http::response('Internal Server Error', 500),
        ]);

        $client->get('https://example.com/success');

        /** @var \Sentry\Tracing\Span $span */
        $span = last($transaction->getSpanRecorder()->getSpans());

        $this->assertEquals('http.client', $span->getOp());
        $this->assertEquals(SpanStatus::ok(), $span->getStatus());

        $client->get('https://example.com/error');

        /** @var \Sentry\Tracing\Span $span */
        $span = last($transaction->getSpanRecorder()->getSpans());

        $this->assertEquals('http.client', $span->getOp());
        $this->assertEquals(SpanStatus::internalError(), $span->getStatus());
    }

    public function testHttpClientSpanIsNotRecordedWhenDisabled(): void
    {
        $this->resetApplicationWithConfig([
            'sentry.tracing.http_client_requests' => false,
        ]);

        $transaction = $this->startTransaction();

        $client = Http::fake();

        $client->get('https://example.com');

        /** @var \Sentry\Tracing\Span $span */
        $span = last($transaction->getSpanRecorder()->getSpans());

        $this->assertNotEquals('http.client', $span->getOp());
    }

    public function testHttpClientRequestTracingHeadersAreAttached(): void
    {
        if (!method_exists(Factory::class, 'globalRequestMiddleware')) {
            $this->markTestSkipped('The `globalRequestMiddleware` functionality we rely on was introduced in Laravel 10.14');
        }

        $this->resetApplicationWithConfig([
            'sentry.trace_propagation_targets' => ['example.com'],
        ]);

        $client = Http::fake();

        $client->get('https://example.com');

        Http::assertSent(function (Request $request) {
            return $request->hasHeader('baggage') && $request->hasHeader('sentry-trace');
        });

        $client->get('https://no-headers.example.com');

        Http::assertSent(function (Request $request) {
            return !$request->hasHeader('baggage') && !$request->hasHeader('sentry-trace');
        });
    }
}
