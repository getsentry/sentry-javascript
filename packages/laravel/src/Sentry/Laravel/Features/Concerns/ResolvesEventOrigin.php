<?php

namespace Sentry\Laravel\Features\Concerns;

use Illuminate\Contracts\Container\Container;
use Sentry\Laravel\Tracing\BacktraceHelper;

trait ResolvesEventOrigin
{
    protected function container(): Container
    {
        return app();
    }

    protected function resolveEventOrigin(): ?array
    {
        $backtraceHelper = $this->makeBacktraceHelper();

        // We limit the backtrace to 20 frames to prevent too much overhead and we'd reasonable expect the origin to be within the first 20 frames
        $firstAppFrame = $backtraceHelper->findFirstInAppFrameForBacktrace(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 20));

        if ($firstAppFrame === null) {
            return null;
        }

        $filePath = $backtraceHelper->getOriginalViewPathForFrameOfCompiledViewPath($firstAppFrame) ?? $firstAppFrame->getFile();

        return [
            'code.filepath' => $filePath,
            'code.function' => $firstAppFrame->getFunctionName(),
            'code.lineno' => $firstAppFrame->getLine(),
        ];
    }

    protected function resolveEventOriginAsString(): ?string
    {
        $origin = $this->resolveEventOrigin();

        if ($origin === null) {
            return null;
        }

        return "{$origin['code.filepath']}:{$origin['code.lineno']}";
    }

    private function makeBacktraceHelper(): BacktraceHelper
    {
        return $this->container()->make(BacktraceHelper::class);
    }
}
