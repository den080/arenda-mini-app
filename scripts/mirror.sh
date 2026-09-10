#!/bin/bash
set -e
cd dist
find . -type f ! -name '.*' ! -name 'telegram-web-app.js' ! -size 0 | sed 's|^\./||' | while read -r f; do
  curl -s --ftp-pasv --retry 3 --retry-delay 2 --ftp-create-dirs --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" || { echo "FAILED: $f"; exit 1; }
done
echo "mirror to reg.ru done"
