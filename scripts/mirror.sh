#!/bin/bash
set -e

echo "=== Starting mirror to FTP ==="

# Проверка переменных окружения
if [ -z "$FTP_HOST" ]; then
  echo "ERROR: FTP_HOST is not set"
  exit 1
fi
if [ -z "$FTP_USER" ]; then
  echo "ERROR: FTP_USER is not set"
  exit 1
fi
if [ -z "$FTP_PASS" ]; then
  echo "ERROR: FTP_PASS is not set"
  exit 1
fi

echo "FTP_HOST: $FTP_HOST"
echo "FTP_USER: $FTP_USER"

cd dist

upload_file() {
  local file="$1"
  local size=$(wc -c < "$file" 2>/dev/null || echo "0")
  echo "Uploading: $file (${size} bytes)"
  
  if curl -s --ftp-pasv --ftp-skip-pasv-ip \
    --retry 3 --retry-delay 2 --retry-max-time 120 \
    --connect-timeout 30 --max-time 300 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file"; then
    echo "✓ Success (pasv): $file"
    return 0
  fi
  
  echo "⚠ Pasv failed, trying active mode..."
  
  if curl -s --ftp-port \
    --retry 2 --retry-delay 3 --retry-max-time 120 \
    --connect-timeout 30 --max-time 300 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file"; then
    echo "✓ Success (active): $file"
    return 0
  fi
  
  echo "✗ FAILED all modes: $file"
  return 1
}

{
  find . -type f ! -name '.*' ! -size 0 -size -100k | sed 's|^\./||' | sort
  find . -type f ! -name '.*' ! -size 0 -size +100k | sed 's|^\./||' | sort
} | while read -r f; do
  if ! upload_file "$f"; then
    echo "=== Mirror FAILED ==="
    exit 1
  fi
done

echo "=== Mirror completed successfully ==="
