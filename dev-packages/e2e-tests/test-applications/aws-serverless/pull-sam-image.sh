#!/bin/bash

# Script to pull the correct Lambda docker image based on the NODE_VERSION environment variable.

set -e

if [[ -z "$NODE_VERSION" ]]; then
    echo "Error: NODE_VERSION not set"
    exit 1
fi

echo "Pulling Lambda Node $NODE_VERSION docker image..."
docker pull "public.ecr.aws/lambda/nodejs:${NODE_VERSION}"

echo "Successfully pulled Lambda Node $NODE_VERSION docker image"
