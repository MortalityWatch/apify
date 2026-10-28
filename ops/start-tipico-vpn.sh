#!/bin/sh
set -eu

# Run on the Docker host. Keep the env file outside the repository, owned by
# root with mode 600. Required values: WIREGUARD_PRIVATE_KEY,
# WIREGUARD_ADDRESSES, HTTPPROXY_USER, HTTPPROXY_PASSWORD.
# The proxy is reachable through the Docker bridge, not a public host port.
# Only Tipico requests opt into it using TIPICO_PROXY_* in the app config.
# This Frankfurt endpoint was verified against Tipico; some other German
# endpoints still receive its country-restriction page.
env_file=${1:?Usage: start-tipico-vpn.sh /path/to/private/gluetun.env}
image=qmcgaw/gluetun@sha256:c2ee4191762fca6b6a3c3359a731198a95d9c9af4db32d466e223bf3a84e779b

test -r "$env_file"
docker run -d \
  --name apify-tipico-vpn \
  --restart unless-stopped \
  --cap-add NET_ADMIN \
  --device /dev/net/tun:/dev/net/tun \
  --publish 172.17.0.1:18888:8888/tcp \
  --env-file "$env_file" \
  --env VPN_SERVICE_PROVIDER=mullvad \
  --env VPN_TYPE=wireguard \
  --env SERVER_COUNTRIES=Germany \
  --env SERVER_CITIES=Frankfurt \
  --env SERVER_HOSTNAMES=de-fra-wg-003 \
  --env HTTPPROXY=on \
  --env HTTPPROXY_STEALTH=on \
  "$image"
