# Extend the GitHub Actions runner image (Ubuntu 24.04 based) to get an
# environment close to what GHA hosted runners provide.
FROM ghcr.io/actions/actions-runner:2.333.1

ARG PLAYWRIGHT_VERSION
ARG NODE_VERSION
ARG YARN_VERSION

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install zstd (required by actions/cache for compression), a JRE for Firebase
# emulators (Firestore, etc. spawn `java -version`), and Node.js + Yarn at the
# versions pinned in the repo's package.json.
RUN sudo apt-get update && \
    sudo apt-get install -y --no-install-recommends zstd openjdk-17-jre-headless && \
    sudo rm -rf /var/lib/apt/lists/*
RUN sudo curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION%%.*}.x | sudo bash - && \
    sudo apt-get install -y --no-install-recommends nodejs && \
    sudo rm -rf /var/lib/apt/lists/* && \
    sudo npm install -g yarn@${YARN_VERSION}

# Install Playwright browsers and their OS-level dependencies.
# Use a fixed path so browsers are found regardless of HOME at runtime
# (GHA sets HOME=/github/home inside containers, not /home/runner).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN sudo mkdir -p /opt/pw-browsers && \
    sudo PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright@${PLAYWRIGHT_VERSION} install chromium webkit firefox --with-deps

# Mark GitHub Actions workspace as safe for git (system-wide config so it
# works regardless of HOME, which GHA overrides to /github/home).
RUN sudo git config --system --add safe.directory '*'

# Ensure /root exists and is owned by root. When running as --user root,
# Firefox requires HOME to be owned by the current user. GHA sets
# HOME=/github/home (owned by runner), but we can't override it.
# The workflow sets HOME=/root via a step, and this ensures /root is ready.
RUN mkdir -p /root
