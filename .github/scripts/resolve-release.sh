#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_OUTPUT:-}" ]; then
  echo "GITHUB_OUTPUT is required" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
MANUAL_TAG="${NPM_TAG_INPUT:-auto}"

# auto: map semver to npm dist-tag — stable → latest, prerelease preid → matching tag
if [ -n "${MANUAL_TAG}" ] && [ "${MANUAL_TAG}" != "auto" ]; then
  NPM_TAG="${MANUAL_TAG}"
else
  if [[ "${VERSION}" == *-* ]]; then
    PREID="${VERSION#*-}"
    PREID="${PREID%%.*}"
    case "${PREID}" in
      alpha|beta|rc|pre|next|canary|dev|experimental)
        NPM_TAG="${PREID}"
        ;;
      *)
        NPM_TAG="beta"
        ;;
    esac
  else
    NPM_TAG="latest"
  fi
fi

if [[ "${VERSION}" == *-* ]]; then
  IS_PRERELEASE=true
else
  IS_PRERELEASE=false
fi

{
  echo "version=${VERSION}"
  echo "npm_tag=${NPM_TAG}"
  echo "is_prerelease=${IS_PRERELEASE}"
} >> "${GITHUB_OUTPUT}"

echo "Resolved release: version=${VERSION}, npm_tag=${NPM_TAG}, prerelease=${IS_PRERELEASE}"
