#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

install_dir="/opt/aven-staging"
compose_file="$install_dir/compose.staging.yml"
env_file="$install_dir/.env.staging"
release_file="$install_dir/deployed-release"
repository="${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY in /etc/aven-staging/deploy.env}"
image_repository="${STAGING_IMAGE_REPOSITORY:?Set STAGING_IMAGE_REPOSITORY in /etc/aven-staging/deploy.env}"
test "$repository" = "yuxianlim/clinicwebsite"
test "$image_repository" = "ghcr.io/yuxianlim/clinicwebsite"

exec 9>"$install_dir/deploy.lock"
flock -n 9 || exit 0

run_json="$(mktemp "$install_dir/.workflow-runs.XXXXXX")"
previous_env="$(mktemp "$install_dir/.env.staging.previous.XXXXXX")"
cleanup() { rm -f "$run_json" "$previous_env"; }
trap cleanup EXIT

curl --fail --silent --show-error --location \
  --connect-timeout 10 --max-time 60 \
  --header "Accept: application/vnd.github+json" \
  --header "Authorization: Bearer $GITHUB_ACTIONS_TOKEN" \
  --header "X-GitHub-Api-Version: 2022-11-28" \
  --output "$run_json" \
  "https://api.github.com/repos/$repository/actions/workflows/release-staging.yml/runs?branch=master&status=success&per_page=10"

read -r run_id release_sha < <(python3 - "$run_json" <<'PY'
import json, re, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
runs = [run for run in data.get('workflow_runs', [])
        if run.get('conclusion') == 'success' and run.get('head_branch') == 'master'
        and run.get('event') in ('push', 'workflow_dispatch')]
if not runs:
    raise SystemExit('No successful trusted staging workflow run was found.')
run = max(runs, key=lambda item: int(item['id']))
sha = run.get('head_sha', '')
if not re.fullmatch(r'[0-9a-f]{40}', sha):
    raise SystemExit('The selected workflow run has an invalid commit SHA.')
print(int(run['id']), sha)
PY
)

current_run_id=0
if test -f "$release_file"; then
  current_run_id="$(sed -n 's/^GITHUB_RUN_ID=//p' "$release_file")"
  [[ "$current_run_id" =~ ^[0-9]+$ ]] || exit 1
fi
if (( run_id <= current_run_id )); then exit 0; fi

candidate="$image_repository:$release_sha"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin >/dev/null
docker pull "$candidate"
digest="$(docker image inspect "$candidate" --format '{{index .RepoDigests 0}}')"
[[ "$digest" == "$image_repository@sha256:"* ]]

cp --preserve=mode,ownership "$env_file" "$previous_env"

had_running=false
app_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps --status running -q app)"
if test -n "$app_container"; then
  had_running=true
  test "$(docker inspect --format '{{.State.Health.Status}}' "$app_container")" = "healthy"
  docker compose --env-file "$env_file" -f "$compose_file" exec -T app node /app/deploy/container-backup.mjs
elif find "$install_dir/state" -maxdepth 1 -type f -name '*.sqlite*' -print -quit | grep -q .; then
  echo 'Refusing first deployment because unbacked SQLite files already exist.' >&2
  exit 1
fi

python3 - "$env_file" "$digest" <<'PY'
import os, pathlib, sys, tempfile
p = pathlib.Path(sys.argv[1])
lines = p.read_text().splitlines()
value = 'RELEASE_IMAGE=' + sys.argv[2]
lines = [value if line.startswith('RELEASE_IMAGE=') else line for line in lines]
if not any(line.startswith('RELEASE_IMAGE=') for line in p.read_text().splitlines()): lines.append(value)
fd, temporary = tempfile.mkstemp(prefix='.env.staging.', dir=p.parent, text=True)
with os.fdopen(fd, 'w') as output: output.write('\n'.join(lines) + '\n')
os.chmod(temporary, 0o600)
os.replace(temporary, p)
PY

if docker compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans --wait --wait-timeout 120; then
  release_temp="$(mktemp "$install_dir/.deployed-release.XXXXXX")"
  printf 'GITHUB_RUN_ID=%s\nGITHUB_SHA=%s\nRELEASE_IMAGE=%s\n' "$run_id" "$release_sha" "$digest" >"$release_temp"
  chmod 600 "$release_temp"
  mv -f "$release_temp" "$release_file"
  docker image prune -f --filter 'until=168h' >/dev/null
  exit 0
fi

cp --preserve=mode,ownership "$previous_env" "$env_file"
if "$had_running"; then
  docker compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans --wait --wait-timeout 120
  echo 'New release failed health verification; previous application image restored.' >&2
else
  docker compose --env-file "$env_file" -f "$compose_file" down
  echo 'Initial release failed health verification; staging containers were stopped.' >&2
fi
exit 1
