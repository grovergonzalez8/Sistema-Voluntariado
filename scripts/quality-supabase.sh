#!/usr/bin/env bash
set -euo pipefail

project=sistema-voluntariado
network="supabase_network_$project"
table=sv_quality_ingress
binding_opt=com.docker.network.bridge.host_binding_ipv4

owned_network() {
  local owner
  owner="$(docker network inspect "$network" --format '{{index .Labels "sv.quality.run"}}')"
  test -n "${GITHUB_RUN_ID:-}" && test -n "${GITHUB_RUN_ATTEMPT:-}" &&
    test "$owner" = "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
}

verify_network() {
  owned_network &&
    test "$(docker network inspect "$network" --format "{{index .Options \"$binding_opt\"}}")" = 127.0.0.1
}

verify_stack() {
  verify_network
  local ids
  ids="$(docker ps -aq --no-trunc --filter "label=com.supabase.cli.project=$project")"
  if [[ -z "$ids" ]]; then
    echo 'Supabase stack not found.' >&2
    return 1
  fi
  # Full inspect stays in the pipe because its environment contains local keys.
  mapfile -t containers <<< "$ids"
  docker inspect "${containers[@]}" | node scripts/check-quality-bindings.mjs stack
}

prepare() (
  if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "$(uname -s)" != Linux ]]; then
    echo 'The Quality isolation setup requires a GitHub-hosted Linux runner.' >&2
    return 1
  fi
  if docker network inspect "$network" >/dev/null 2>&1; then
    echo 'Refusing to reuse an existing Supabase network.' >&2
    return 1
  fi

  # Guard ingress before Docker's DNAT hooks, independently of its bind defaults.
  sudo -n nft -f - <<'NFT'
table inet sv_quality_ingress {
  chain before_docker_dnat {
    type filter hook prerouting priority -150; policy accept;
    iifname != "lo" fib daddr type local ct state new meta l4proto { tcp, udp } counter drop
  }
}
NFT
  sudo -n nft list chain inet "$table" before_docker_dnat
  # The CLI preflight prunes networks with its project label, so use our own.
  docker network create --driver bridge --ipv6=false \
    --label "sv.quality.run=$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
    --opt "$binding_opt=127.0.0.1" "$network"
  verify_network

  local probe
  # No listener, seed or credentials in the probe. Exercise native port defaulting.
  probe="$(docker run -d --network "$network" --publish 15432:8080/tcp busybox:1.37.0 sleep 60)"
  trap 'docker rm -f "$probe" >/dev/null' EXIT
  docker inspect "$probe" | node scripts/check-quality-bindings.mjs probe
  docker rm -f "$probe" >/dev/null
  trap - EXIT
)

start_unseeded() (
  local backup
  verify_network
  backup="$(mktemp)"
  cp supabase/config.toml "$backup"
  trap 'mv "$backup" supabase/config.toml' EXIT
  sed -i '/^\[db\.migrations\]$/,/^\[/s/^enabled = true$/enabled = false/;
          /^\[db\.seed\]$/,/^\[/s/^enabled = true$/enabled = false/' supabase/config.toml
  python3 - <<'PY'
import tomllib

with open("supabase/config.toml", "rb") as file:
    config = tomllib.load(file)
assert config["db"]["migrations"]["enabled"] is False
assert config["db"]["seed"]["enabled"] is False
assert config["local_smtp"]["enabled"] is True
assert config["auth"]["email"]["smtp"]["enabled"] is False
PY
  # The Supabase status banner includes local keys on stdout.
  pnpm db:start >/dev/null
  verify_stack
)

cleanup() {
  if ! owned_network; then
    echo 'No owned Quality network to clean.'
    return 0
  fi
  pnpm db:stop --no-backup
  test -z "$(docker ps -aq --filter "label=com.supabase.cli.project=$project")"
  test -z "$(docker volume ls -q --filter "label=com.supabase.cli.project=$project")"
  test "$(docker network inspect "$network" --format '{{len .Containers}}')" = 0
  docker network rm "$network"
  sudo -n nft delete table inet "$table"
}

case "${1:-}" in
  prepare) prepare ;;
  start-unseeded) start_unseeded ;;
  verify) verify_stack ;;
  cleanup) cleanup ;;
  *) echo 'Expected prepare, start-unseeded, verify or cleanup.' >&2; exit 2 ;;
esac
