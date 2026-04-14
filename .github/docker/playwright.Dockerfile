ARG PLAYWRIGHT_VERSION=1.56.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# Install yarn (v1) for the monorepo
RUN npm install -g yarn@1.22.22
