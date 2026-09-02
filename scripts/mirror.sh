#!/bin/bash
set -e
cd dist
find . -type f | sed 's|^\./||' | while read -r f; do
  curl -s --ftp-pasv --retry 2 --ftp-create-dirs -T "$f" "ftp://$FTP_USER:$FTP_PASS@$FTP_HOST/$f"
done
echo "mirror to reg.ru done"
