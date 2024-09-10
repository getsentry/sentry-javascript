<?php

namespace Sentry\Laravel\Features\Storage;

trait FilesystemAdapterDecorator
{
    use CloudFilesystemDecorator;

    public function assertExists($path, $content = null)
    {
        [$description, $data] = $this->getDescriptionAndDataForPathOrPaths($path);

        return $this->withSentry(__FUNCTION__, func_get_args(), $description, $data);
    }

    public function assertMissing($path)
    {
        [$description, $data] = $this->getDescriptionAndDataForPathOrPaths($path);

        return $this->withSentry(__FUNCTION__, func_get_args(), $description, $data);
    }

    public function assertDirectoryEmpty($path)
    {
        return $this->withSentry(__FUNCTION__, func_get_args(), $path, compact('path'));
    }

    public function temporaryUrl($path, $expiration, array $options = [])
    {
        return $this->withSentry(__FUNCTION__, func_get_args(), $path, compact('path', 'expiration', 'options'));
    }

    public function temporaryUploadUrl($path, $expiration, array $options = [])
    {
        return $this->withSentry(__FUNCTION__, func_get_args(), $path, compact('path', 'expiration', 'options'));
    }
}
