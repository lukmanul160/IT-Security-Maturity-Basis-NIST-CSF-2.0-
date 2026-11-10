#!/bin/sh
set -eu
address=${BLACKOWL_ADDRESS:?Set BLACKOWL_ADDRESS to the VM IPv4 or domain}
case "$address" in
    *[!a-zA-Z0-9.-]*|'') echo 'Invalid BLACKOWL_ADDRESS (IPv4/domain only)' >&2; exit 1 ;;
esac
# Manual TLS never creates or changes supplied certificates.
if ! grep -Eq '^[[:space:]]*ssl_certificate[[:space:]]+/etc/nginx/generated/server.crt;' /etc/nginx/templates/default.conf.template; then
    exit 0
fi
cd /etc/nginx/generated
umask 077
if [ ! -f root.crt ] && [ ! -f root.key ]; then
    openssl req -x509 -newkey rsa:3072 -nodes -days 3650 \
        -keyout root.key -out root.crt -subj '/CN=NIST Basis Local CA' \
        -addext 'basicConstraints=critical,CA:TRUE' \
        -addext 'keyUsage=critical,keyCertSign,cRLSign'
fi
# Fail on incomplete/expired CA rather than silently replacing its identity.
test -s root.crt && test -s root.key
openssl x509 -in root.crt -checkend 86400 -noout
if [ -f address ] && [ "$(cat address)" = "$address" ] && [ -s server.key ] \
    && openssl x509 -in server.crt -checkend 2592000 -noout 2>/dev/null; then
    exit 0
fi
case "$address" in
    *[!0-9.]*) san="DNS:$address" ;;
    *) san="IP:$address" ;;
esac
printf 'subjectAltName=%s\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$san" > server.ext
openssl req -new -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$address"
openssl x509 -req -in server.csr -CA root.crt -CAkey root.key -CAcreateserial \
    -days 365 -sha256 -extfile server.ext -out server.crt
printf '%s' "$address" > address
chmod 644 root.crt server.crt
