<?php

namespace Sentry\Laravel\Integration\ModelViolations;

use Exception;
use Illuminate\Database\Eloquent\MassAssignmentException;
use Illuminate\Database\Eloquent\Model;

class DiscardedAttributeViolationReporter extends ModelViolationReporter
{
    protected function getViolationContext(Model $model, string $property): array
    {
        return [
            'attribute' => $property,
            'kind' => 'discarded_attribute',
        ];
    }

    protected function getViolationException(Model $model, string $property): Exception
    {
        return new MassAssignmentException(sprintf(
            'Add [%s] to fillable property to allow mass assignment on [%s].',
            $property,
            get_class($model)
        ));
    }
}
