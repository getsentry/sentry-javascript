# PLAYWRIGHT_VERSION is passed as a build arg by the ensure-playwright-image action.
# The canonical source is dev-packages/browser-integration-tests/package.json.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# Install yarn (v1) for the monorepo
RUN npm install -g yarn@1.22.22
