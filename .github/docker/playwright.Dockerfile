# Extend the GitHub Actions runner image (Ubuntu 24.04 based) to get an
# environment close to what GHA hosted runners provide.
FROM ghcr.io/actions/actions-runner:2.333.1

ARG PLAYWRIGHT_VERSION
ARG NODE_VERSION
ARG YARN_VERSION

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install zstd (required by actions/cache for compression) and Node.js + Yarn
# at the versions pinned in the repo's package.json.
RUN sudo apt-get update && \
    sudo apt-get install -y --no-install-recommends zstd && \
    sudo rm -rf /var/lib/apt/lists/*
RUN sudo curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION%%.*}.x | sudo bash - && \
    sudo apt-get install -y --no-install-recommends nodejs && \
    sudo rm -rf /var/lib/apt/lists/* && \
    sudo npm install -g yarn@${YARN_VERSION}

# Install Playwright browsers and their OS-level dependencies.
# `--with-deps` installs required system libraries (libglib, libatk, libnss, etc.).
RUN sudo npx playwright@${PLAYWRIGHT_VERSION} install chromium webkit firefox --with-deps

# Mark GitHub Actions workspace as safe for git.
# The container may run with a different workspace owner,
# causing "dubious ownership" errors in git operations (e.g. rollup build).
RUN git config --global --add safe.directory '*'
