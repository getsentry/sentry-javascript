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

# Docker CLI + Compose v2 for E2E apps that run `docker compose` against the
# host daemon (workflows mount /var/run/docker.sock). Image is built amd64 on GHA.
ARG DOCKER_VERSION=27.4.1
ARG DOCKER_COMPOSE_VERSION=2.32.1
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" | sudo tar -xz -C /tmp && \
    sudo mv /tmp/docker/docker /usr/local/bin/docker && \
    sudo rm -rf /tmp/docker && \
    sudo mkdir -p /usr/local/lib/docker/cli-plugins && \
    sudo curl -fsSL "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
