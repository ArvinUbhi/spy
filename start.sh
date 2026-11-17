#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Spy needs Node.js 22.12 or newer. Install Node.js LTS from https://nodejs.org and try again.'
  exit 1
fi
exec node scripts/launch.mjs "$@"
