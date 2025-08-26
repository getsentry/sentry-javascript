#!/bin/bash

# Script to pull the correct SAM docker image based on the NODE_VERSION environment variable.

set -e

if [[ -z "$NODE_VERSION" ]]; then
    echo "Error: NODE_VERSION not set"
    exit 1
fi

echo "Pulling SAM Node $NODE_VERSION docker image..."
docker pull "public.ecr.aws/sam/build-nodejs${NODE_VERSION}.x:latest"

echo "Successfully pulled SAM Node $NODE_VERSION docker image"
