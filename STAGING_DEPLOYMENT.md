# Restricted fictional staging deployment (draft)

This prepares `aven.sean.tcmusa.ai` for a single Ubuntu server. It does not deploy anything. The school terminates public HTTPS; Caddy accepts HTTP on port 80 and must only be reachable through that trusted proxy/network path. Caddy Basic Auth restricts every browser/application route. The exact `/api/stripe/webhook` path bypasses Basic Auth so Stripe can deliver events, but the application still requires a valid Stripe signature and refuses live events/keys in fictional staging. Application administrator password+TOTP, learner ownership, role checks, rate limits, and demo labels remain additional controls.

## 1. Windows: review and test

1. Work only in this repository. Do not copy `.env.local`, `.data`, databases, VPN/SSH files, or private documents from Downloads.
2. Review `app/lib/deploymentMode.ts`, `compose.staging.yml`, `deploy/Caddyfile`, `.github/workflows/release-staging.yml`, and `deploy/server/deploy-staging.sh`.
3. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build`. Optional: build locally with `docker build -t aven-staging:review .` after Docker Desktop is available.
4. Commit only reviewed source/configuration. Confirm `git status --ignored` shows secrets and data ignored.

## 2. GitHub: review before enabling

1. Review the draft workflow. Its read-only validation job runs the full Linux tests, lint, production build, and a non-publishing Docker build. Only then can the separate package-write job publish the commit-SHA tag under the public `ghcr.io/yuxianlim/aven-staging` package; GitHub never connects to Ubuntu, the school VPN, or SSH. The source repository remains public at `yuxianlim/clinicwebsite` on `master`.
2. Public source and release images contain no runtime credentials, databases, private documents, SSH/VPN material, or private configuration. Restricted access comes from the server's private runtime configuration, Caddy gate, application authentication/authorization, fictional-staging guards, and the school network boundary—not from image secrecy.
3. Commit the workflow only when ready. Run it manually once and inspect all checks and the image digest. Do not add personal SSH keys.
4. Initial release discovery uses the unauthenticated public GitHub API, and Ubuntu pulls the public GHCR image without logging in. Do not put a GitHub or GHCR token in `/etc/aven-staging/deploy.env`. Anonymous API capacity is limited, so the script backs off on failures and rate limits.

## 3. Ubuntu: prepare, but do not run these steps until approved

1. Install Docker Engine with the Compose plugin using the school-approved method. Create a dedicated `aven-deploy` system user with only the Docker access the school accepts (Docker access is root-equivalent).
2. Copy the reviewed repository deployment files to `/opt/aven-staging`. Create `/opt/aven-staging/state`, owned by UID/GID `1001:1001`, mode `0700`. Keep the directory on backed-up persistent server storage.
3. Copy `.env.staging.example` to `/opt/aven-staging/.env.staging`, mode `0600`. Replace every placeholder. Generate unrelated random values for the outer Caddy password, administrator password, TOTP secret, and session secret. Configure only Stripe sandbox keys plus the sandbox endpoint signing secret; live keys are refused. Verify the pinned Caddy image digest before entering it.
4. Generate the Caddy password hash with the command shown in the example file. Because hashes contain `$`, keep it in the env file, enclose the complete hash in single quotes there, and do not paste it into Compose YAML.
5. Copy `deploy/server/deploy.env.example` to `/etc/aven-staging/deploy.env`, owned by root and mode `0600`. It identifies only the public source repository and public image repository; application secrets remain exclusively in `/opt/aven-staging/.env.staging`.
6. Confirm the school HTTPS proxy forwards the original host to this server's port 80, blocks direct public access to port 80, preserves client addressing according to school policy, and does not bypass Caddy authentication.
7. Review the unit and timer. Only after approval, copy them to `/etc/systemd/system`, run `systemctl daemon-reload`, manually run the service once, inspect `journalctl -u aven-staging-deploy`, then enable the timer. These actions are intentionally not performed by this repository work.

## Release, backup, health, and rollback behavior

Approximately every five minutes, the Ubuntu timer invokes the serialized deployment check. The script asks the unauthenticated public GitHub API for the highest-ID successful trusted run of this workflow on the verified default branch, `master`, refuses a run ID at or below the already deployed run, anonymously pulls that run's public commit-SHA image tag, and resolves it to an immutable digest. API and rate-limit failures use bounded backoff and exit before any running application state is changed. A host `flock` serializes deployments. Before changing the application image it runs online SQLite backups from the healthy old container. It then writes the digest to the private env file and waits for `/api/health`. On failure it restores only the previous application image reference and waits for that application to become healthy; it never copies an older database over the live data. Backups remain under `state/backups`; retention and encrypted off-host copying are still an operator decision.

The health route reports only service/mode status. It fails unless persistent storage can actually create/delete a probe file, the proxy/origin settings contain no placeholders, restricted fictional staging mode is active, administrator password+TOTP configuration is present, and matching Stripe sandbox keys/webhook secret are configured.

## Proposed isolated Linux/Docker validation on the existing Ubuntu server

Do this only after review, in a dedicated temporary directory; do not touch `/opt/aven-staging`, systemd, port 80, or the live state directory.

1. Copy the reviewed source to the isolated directory and confirm `git status --short`, `git ls-files`, and `docker buildx build --check .` expose no `.env`, SQLite, npm cache, key, VPN, or private-document paths.
2. Without a GitHub token, query the public workflow-runs endpoint used by the deployment script. Confirm the selected run is successful, belongs to `master`, has an allowed event, and has a 40-character commit SHA. Record only public run metadata.
3. Without a GHCR login, pull that commit-SHA tag into the isolated Docker cache, inspect its repository digest, and require the digest to begin with `ghcr.io/yuxianlim/aven-staging@sha256:`. Remove only this validation pull when finished. This public-release check does not start a container or bind a port.
4. Run `npm ci --no-audit --no-fund`, `npm test`, `npm run lint`, and `npm run build` under Ubuntu. Stop on any failure.
5. Build a clearly labeled local validation image. Set `CADDY_BIND_IP=127.0.0.1` and `CADDY_HOST_PORT=18080`, use a new temporary `state` directory, and use a private mode-0600 validation env file with newly generated fictional credentials and explicitly local Stripe test fixtures; never reuse production or personal values.
6. Run `docker compose config`, inspect the fully resolved mounts/images without printing secret values, then start the isolated stack. Verify the app container health check and `GET /api/health` from inside the Compose network.
7. Verify `http://127.0.0.1:18080/` returns 401 without Basic Auth and succeeds with it. Verify another application route still returns 401 without Basic Auth.
8. POST an invalid signature to the exact webhook URL without Basic Auth and expect application HTTP 400, proving Caddy reached the signature verifier rather than returning 401. Using a disposable sandbox endpoint secret, send a locally signed fictional test event and confirm it reaches application validation. Send a locally signed `livemode: true` fixture and expect HTTP 400 with no database enrollment/audit success.
9. Create only fictional records, restart/recreate the app container, and verify the records persist in the isolated bind mount. Run `/app/deploy/container-backup.mjs`, verify its manifest/checksums and SQLite integrity, and confirm no restore occurs during an image-only rollback exercise.
10. Test rollback with two locally built images: a healthy prior image and an intentionally unhealthy candidate. Confirm the previous image reference returns, the same state directory remains mounted, and records created before/during the failed attempt are not replaced from backup.
11. Stop the validation stack and remove only its containers, local validation images, temporary env file, and isolated state after the evidence is reviewed. Do not install or enable the service/timer during this validation.

## Private decisions still required

- School confirmation of the HTTPS-to-port-80 network boundary and allowed source addresses.
- Staging Basic Auth username/password, administrator email/password/TOTP seed, and 32+ character session secret.
- Backup retention, encrypted off-host destination, restore drill owner, maintenance window, and alerting for failed service/timer runs.
- Whether fixed public demo staff/learner credentials are acceptable behind the outer gate. If not, replace that fixture-login design before launch.
