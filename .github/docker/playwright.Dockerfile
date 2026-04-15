# Use the same Ubuntu version as GitHub Actions runners (ubuntu-24.04)
# instead of the official Playwright image, to avoid missing system
# packages and configuration differences.
FROM ubuntu:24.04

ARG PLAYWRIGHT_VERSION

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      git \
      gnupg && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright browsers and their OS-level dependencies.
# `npx playwright install --with-deps` installs both browsers and
# any missing system libraries (libglib, libatk, libnss, etc.).
RUN npx playwright@${PLAYWRIGHT_VERSION} install --with-deps

# Mark GitHub Actions workspace as safe for git.
# The container runs as root but the workspace is owned by a different user,
# causing "dubious ownership" errors in git operations (e.g. rollup build).
RUN git config --global --add safe.directory '*'
