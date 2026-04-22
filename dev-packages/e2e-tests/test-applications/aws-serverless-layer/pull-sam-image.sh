#!/bin/bash

# Pull the Lambda Node docker image for SAM local. NODE_VERSION should be the major only (e.g. 20).
# Defaults to 20 to match the repo's Volta Node major (see root package.json "volta.node").

set -e

NODE_VERSION="${NODE_VERSION:-20}"

echo "Pulling Lambda Node $NODE_VERSION docker image..."
docker pull "public.ecr.aws/lambda/nodejs:${NODE_VERSION}"

echo "Successfully pulled Lambda Node $NODE_VERSION docker image"
