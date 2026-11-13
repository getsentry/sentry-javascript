#!/bin/sh
# Old Chromium links against libXss, which current runner images don't ship. Installing from the image's
# package lists is fast; only refresh them when they are too stale to resolve the package.
set -eu

if ! sudo apt-get install -y --no-install-recommends libxss1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends libxss1
fi
