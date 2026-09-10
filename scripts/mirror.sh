#!/bin/bash
set -e
cd dist
find . -type f ! -name '.*' ! -size 0 | sed 's|^\./||' | while read -r f; do
  curl -s --ftp-pasv --ftp-create-dirs --retry 3 --retry-delay 2 --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" || { echo "FAILED: $f"; exit 1; }
done
echo "mirror to reg.ru done"
