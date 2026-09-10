#!/bin/bash
set -e
cd dist
find . -type f ! -name '.*' ! -name 'telegram-web-app.js' ! -size 0 | sed 's|^\./||' | while read -r f; do
  echo "Uploading: $f ($(wc -c < "$f") bytes)"
  if ! curl -v --ftp-pasv --retry 3 --retry-delay 2 --connect-timeout 30 --max-time 300 --ftp-create-dirs --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" 2>&1; then
    echo "FAILED: $f"
    exit 1
  fi
  echo "✓ Success: $f"
done
echo "mirror to reg.ru done"
