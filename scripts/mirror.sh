#!/bin/bash
set -e
cd dist
find . -type f | sed 's|^\./||' | while read -r f; do
  curl -s --ftp-pasv --retry 2 --ftp-create-dirs --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" || { echo "FAILED: $f"; exit 1; }
done
echo "mirror to reg.ru done"
