# Use Ubuntu as the base image
FROM ubuntu:24.04

# Set to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-setuptools \
    build-essential \
    libvips-dev \
    zip

# install volta
RUN curl https://get.volta.sh | bash
# needed by volta() function
ENV VOLTA_HOME /$HOME/.volta
# make sure packages managed by volta will be in PATH
ENV PATH $VOLTA_HOME/bin:$PATH

# enable to run E2E tests locally
#RUN export VOLTA_FEATURE_PNPM=1
