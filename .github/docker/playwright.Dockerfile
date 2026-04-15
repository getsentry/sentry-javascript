# PLAYWRIGHT_VERSION is passed as a build arg by the ensure-playwright-image action.
# The canonical source is dev-packages/browser-integration-tests/package.json.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# Install yarn (v1) for the monorepo
RUN npm install -g yarn@1.22.22

# Mark GitHub Actions workspace as safe for git.
# The container runs as root but the workspace is owned by a different user,
# causing "dubious ownership" errors in git operations (e.g. rollup build).
RUN git config --global --add safe.directory '*'
