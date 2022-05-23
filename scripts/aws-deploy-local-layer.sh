#!/usr/bin/env bash
#
# Builds and deploys the Sentry AWS Lambda layer (including the Sentry SDK and the Sentry Lambda Extension)
#
# The currently checked out version of the SDK in your local directory is used.
# The latest version of the Lambda Extension is fetched from the Sentry Release Registry.
#

set -euo pipefail

# Cleanup
echo "Preparing local directories for new build..."
rm -rf dist-serverless/
rm -rf ./packages/serverless/build
rm -rf ./packages/serverless/dist
rm -rf ./packages/serverless/node_modules
rm -f sentry-node-serverless-*.zip

# Creating Lambda layer
echo "Creating Lambda layer in ./packages/serverless/build/aws/dist-serverless..."
cd packages/serverless
yarn build
cd ../../
echo "Done creating Lambda layer in ./packages/serverless/build/aws/dist-serverless."

# Move dist-serverless/ to the root folder for the action to pick it up.
# This is only needed in this script, because in GitHub workflow
# this is done with the upload-artifact/download-artifact actions
echo "Copying Lambda layer in ./packages/serverless/build/aws/dist-serverless to working directory..."
mv ./packages/serverless/build/aws/dist-serverless .
echo "Done copying Lambda layer in ./packages/serverless/build/aws/dist-serverless to working directory."

# IMPORTANT:
# Please make sure that this does the same as the GitHub action that
# is building the Lambda layer in production!
# see: https://github.com/getsentry/action-build-aws-lambda-extension/blob/main/action.yml#L23-L40

# Adding Sentry Lambda extension to Lambda layer
echo "Adding Sentry Lambda extension to Lambda layer in ./dist-serverless..."
mkdir -p dist-serverless/extensions
curl -0 --silent --output dist-serverless/extensions/sentry-lambda-extension `curl -s https://release-registry.services.sentry.io/apps/sentry-lambda-extension/latest | jq -r .files.\"sentry-lambda-extension\".url`
chmod +x dist-serverless/extensions/sentry-lambda-extension
echo "Done adding Sentry Lambda extension to Lambda layer in ./dist-serverless."


# Zip Lambda layer and included Lambda extension
echo "Zipping Lambda layer and included Lambda extension..."
cd dist-serverless/
zip -r -y ../sentry-node-serverless-x.x.x-dev.zip .
cd ..
echo "Done Zipping Lambda layer and included Lambda extension to ./sentry-node-serverless-x.x.x-dev.zip."


# Deploying zipped Lambda layer to AWS
echo "Deploying zipped Lambda layer to AWS..."

aws lambda publish-layer-version \
    --layer-name "SentryNodeServerlessSDK-local-dev" \
    --region "eu-central-1" \
    --zip-file "fileb://sentry-node-serverless-x.x.x-dev.zip" \
    --description "Local test build of SentryNodeServerlessSDK (can be deleted)" \
    --no-cli-pager

echo "Done deploying zipped Lambda layer to AWS as 'SentryNodeServerlessSDK-local-dev'."

echo "All done. Have a nice day!"
