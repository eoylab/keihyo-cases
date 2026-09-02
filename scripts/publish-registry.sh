#!/bin/sh
# Releases the bundle and publishes this version to the MCP Registry.
#
#   scripts/publish-registry.sh <version>
#
# One script rather than steps copied into two workflows. Both the tag-triggered
# publish and the monthly refresh have to do exactly this, and two copies of a
# release-and-publish sequence drift until one of them is wrong in a way nobody
# sees until a month is missing from the registry.
#
# Runs only inside GitHub Actions: authentication is OIDC, which needs the
# job's id-token, and there is no interactive fallback on purpose — a browser
# device flow would need a person, and the point of this is that no one has to
# be there.
set -eu

VERSION="$1"
TAG="v${VERSION}"
BUNDLE="build/keihyo-cases.mcpb"

[ -f "$BUNDLE" ] || { echo "バンドルが無い: $BUNDLE" >&2; exit 1; }

# The manifest names the release the registry will fetch from, so a version
# that does not match the URL inside it publishes a pointer to nothing.
DECLARED=$(node -p "require('./server.json').version")
[ "$DECLARED" = "$VERSION" ] || {
  echo "server.json の version が違う: $DECLARED / $VERSION" >&2; exit 1; }

NOTES="MCPB bundle for the MCP Registry. Contains the server and the ${TAG} data snapshot. SHA-256 is pinned in server.json."
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --title "$TAG" --notes "$NOTES"
  gh release upload "$TAG" "$BUNDLE" --clobber
else
  gh release create "$TAG" "$BUNDLE" --title "$TAG" --notes "$NOTES"
fi

curl -sSL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher
./mcp-publisher login github-oidc
./mcp-publisher publish
