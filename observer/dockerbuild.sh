#!/bin/bash

#if script is running with sudo privileges...
if [ $(id -u) -eq 0 ]; then
# Check the daemon is reachable at all
if docker info >/dev/null 2>&1; then

  CI= npm run build

  echo "Building and pushing docker image (linux/amd64, linux/arm64)..."
  if ! docker buildx build --platform linux/amd64,linux/arm64 -t arthmc/observer:latest --push .; then
    echo "Build/push failed. Run 'sudo docker login' and try again."
    exit 1
  fi

  exit 0
else
    echo "Docker is not installed or not running."
fi
else
  echo "This script is not running with sudo privileges. Run 'sudo sh dockerbuild.sh' instead."
  exit 1
fi

