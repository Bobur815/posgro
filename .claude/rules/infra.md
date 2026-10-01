---
paths:
  - "docker-compose*.yml"
  - "Dockerfile"
  - "docker-entrypoint.sh"
  - "nginx/**"
  - ".github/**"
  - "scripts/**"
---

# Docker / VPS / CI rules

- Production (`~/posgro`, `main`, DB `posgro`, port 3001) and staging (`~/posgro-staging`, `dev`, DB `posgro_staging`, port 3002) share one VPS. Never touch production from an agent session (hook blocks mutating ssh to `~/posgro`).
- Never `down -v`, `volume rm/prune`, `system prune`. Production data needs a verified backup **and** restore check first (`pg-backup` skill).
- Postgres port must not be published publicly (Docker bypasses UFW). Bind `127.0.0.1` or don't publish.
- Match the Postgres image major to the running one (check `PG_MAJOR` inside the container; docs disagree between 15 and 17).
- Do not change DB credentials in `.env` for an initialized volume (SCRAM mismatch). Fix inside the running container with `ALTER USER`.
- `docker-entrypoint.sh` and all `*.sh` must stay LF.
- Nginx: keep TLS and the `/api` proxy intact; staging config is deployed automatically by `deploy-staging.yml`. Test with `nginx -t` before any reload.
- `CORS_ORIGINS=*` is dev-only. Add healthchecks and `depends_on: condition: service_healthy` when touching compose.
- Workflow files under `.github/` change how production deploys: always ask first, explain the blast radius.
