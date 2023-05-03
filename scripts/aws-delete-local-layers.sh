#!/usr/bin/env bash
#
# Deletes all versions of the layer specified in LAYER_NAME in one region.
#

set -euo pipefail

# override default AWS region
export AWS_REGION=eu-central-1

LAYER_NAME=SentryNodeServerlessSDK-local-dev
VERSION="0"

while [[ $VERSION != "1" ]]
do
  VERSION=$(aws lambda list-layer-versions --layer-name $LAYER_NAME | jq '.LayerVersions[0].Version')
  aws lambda delete-layer-version --layer-name $LAYER_NAME --version-number $VERSION
done
