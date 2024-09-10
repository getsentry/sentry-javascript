<?php

namespace Sentry\Laravel\Integration\ModelViolations;

use Exception;
use Illuminate\Database\Eloquent\MissingAttributeException;
use Illuminate\Database\Eloquent\Model;

class MissingAttributeModelViolationReporter extends ModelViolationReporter
{
    protected function getViolationContext(Model $model, string $property): array
    {
        return [
            'attribute' => $property,
            'kind' => 'missing_attribute',
        ];
    }

    protected function getViolationException(Model $model, string $property): Exception
    {
        return new MissingAttributeException($model, $property);
    }
}
