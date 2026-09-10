#!/bin/bash
set -e

echo "=== Starting mirror to FTP ==="
cd dist

upload_file() {
  local file="$1"
  echo "Uploading: $file"
  if curl -s --ftp-pasv --retry 3 --retry-delay 2 --retry-max-time 120 \
    --connect-timeout 30 --max-time 300 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file"; then
    return 0
  fi
  echo "retry active mode: $file"
  curl -s --ftp-port --retry 2 \
    --connect-timeout 30 --max-time 300 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file" || { echo "FAILED: $file"; exit 1; }
}

# все файлы, кроме скрытых и пустых (включая .htaccess)
find . -type f ! -name '.*' ! -size 0 | sed 's|^\./||' | sort | while read -r f; do
  upload_file "$f" || exit 1
done

echo "=== Mirror completed successfully ==="
