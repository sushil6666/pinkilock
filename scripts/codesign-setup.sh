#!/usr/bin/env bash
# One-time set-up for signed over-the-air updates (docs/build-plan.md, WP5; gap G10).
#
#   scripts/codesign-setup.sh
#
# Makes a key pair and a certificate with Expo's own tool. The certificate goes in the repo
# (code-signing/certificate.pem: app.config.js picks it up, and every build from then on refuses an
# update that was not signed with the key). The private key is written OUTSIDE the repo; put it in
# the GitHub secret EXPO_UPDATES_PRIVATE_KEY, then delete the file. Whoever holds it can ship code
# to every phone.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -e code-signing/certificate.pem ] && { echo "code-signing/certificate.pem already exists; rotating is in OPERATIONS.md" >&2; exit 1; }
keys="$(mktemp -d)"
npx expo-updates codesigning:generate --key-output-directory "$keys" --certificate-output-directory code-signing \
  --certificate-validity-duration-years 10 --certificate-common-name "Pinkilock"
echo
echo "Certificate: code-signing/certificate.pem (commit it)"
echo "Private key: $keys/private-key.pem"
echo "Now: add it as the GitHub secret EXPO_UPDATES_PRIVATE_KEY, then: rm -r $keys"
