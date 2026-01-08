#!/bin/bash
# To enable Sentry in Nuxt dev, it needs the sentry.server.config.mjs file from the .nuxt folder.
# First, we need to start 'nuxt dev' to generate the file, and then start 'nuxt dev' again with the NODE_OPTIONS to have Sentry enabled.

# Using a different port to avoid playwright already starting with the tests for port 3030
TEMP_PORT=3035

# 1.  Start dev in background - this generates .nuxt folder
pnpm dev -p $TEMP_PORT &
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
    echo "This usually means the Nuxt dev server failed to start or generate the file. Try to rerun the test."
    pkill -P $DEV_PID || kill $DEV_PID
    exit 1
fi

# 3.  Cleanup
echo "Found .nuxt/dev/sentry.server.config.mjs, stopping 'nuxt dev' process..."
pkill -P $DEV_PID || kill $DEV_PID

# Wait for port to be released
echo "Waiting for port $TEMP_PORT to be released..."
COUNTER=0
# Check if port is still in use
while lsof -i :$TEMP_PORT > /dev/null 2>&1 && [ $COUNTER -lt 10 ]; do
    sleep 1
    ((COUNTER++))
done

if lsof -i :$TEMP_PORT > /dev/null 2>&1; then
    echo "WARNING: Port $TEMP_PORT still in use after 10 seconds, proceeding anyway..."
else
    echo "Port $TEMP_PORT released successfully"
fi

echo "Starting nuxt dev with Sentry server config..."

# 4.  Start the actual dev command in the background first
NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs' nuxt dev &
DEV_PID=$!

# 5.  Wait for port 3030 to be ready before Playwright starts running tests
echo "Waiting for port 3030 to be ready..."
COUNTER=0
while ! nc -z localhost 3030 2>/dev/null && [ $COUNTER -lt 60 ]; do
    sleep 0.5
    ((COUNTER++))
done

if nc -z localhost 3030 2>/dev/null; then
    echo "Port 3030 is ready!"
else
    echo "WARNING: Port 3030 not ready after 30 seconds"
fi

# 6.  Keep the script running (wait for the background process)
wait $DEV_PID
