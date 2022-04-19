#!/bin/bash

NODE_MAJOR=$(node -v | cut -c2- | cut -d. -f1)

if [ "$NODE_MAJOR" -lt "12" ]; then
  echo "Skipping Prisma tests on Node: $NODE_MAJOR"
  exit 0
fi

yarn && yarn setup
