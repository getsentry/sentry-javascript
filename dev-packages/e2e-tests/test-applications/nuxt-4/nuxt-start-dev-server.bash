#!/bin/bash
# To enable Sentry in Nuxt dev, it needs the sentry.server.config.mjs file from the .nuxt folder.
# First, we need to start 'nuxt dev' to generate the file, and then start 'nuxt dev' again with the NODE_OPTIONS to have Sentry enabled.

# 1.  Start dev in background - this generates .nuxt folder
#     Using a different port to avoid playwright already starting with the tests for port 3030
pnpm dev -p 3035 &
DEV_PID=$!

# 2.  Wait for the sentry.server.config.mjs file to appear
echo "Waiting for .nuxt/dev/sentry.server.config.mjs file..."
COUNTER=0
while [ ! -f ".nuxt/dev/sentry.server.config.mjs" ] && [ $COUNTER -lt 30 ]; do
    sleep 1
    ((COUNTER++))
done

if [ ! -f ".nuxt/dev/sentry.server.config.mjs" ]; then
    echo "ERROR: .nuxt/dev/sentry.server.config.mjs file never appeared!"
    pkill -P $DEV_PID || kill $DEV_PID || pkill -f "nuxt"
    exit 1
fi

# 3.  Cleanup
echo "Found .nuxt/dev/sentry.server.config.mjs, stopping 'nuxt dev' process..."
pkill -P $DEV_PID || kill $DEV_PID || pkill -f "nuxt"
sleep 2 # Give it a moment to release ports

echo "Starting nuxt dev with Sentry server config..."

# 4.  Start the actual dev command which should be used for the tests
NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs' nuxt dev
