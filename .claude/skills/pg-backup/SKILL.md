---
name: pg-backup
description: Back up the posgro PostgreSQL database on the VPS and prove the dump restores in a throwaway container. Use before any migration on production, Postgres or Docker change, credential change, or when the user says backup, dump, restore, or "make sure data is safe".
---

# Backup + verified restore (runs on the VPS, read-only on the live DB)

A backup that hasn't been restored is not a backup. The script runs **on the VPS** in the compose directory, so no customer data is copied to this laptop.

## One-time (user)
Add an alias to `~/.ssh/config` on this machine (Windows OpenSSH reads the same file):

```
Host posgro-vps
  HostName <vps ip>
  User <user>
```

## Run (Git Bash; each ssh call will ask for permission)

```bash
# production
ssh posgro-vps 'cd ~/posgro && bash -s' < .claude/skills/pg-backup/scripts/backup-verify.sh

# staging
ssh posgro-vps 'cd ~/posgro-staging && bash -s' < .claude/skills/pg-backup/scripts/backup-verify.sh
```

The script: dumps in custom format into `~/backups/`, starts a temporary `postgres:<same major>-alpine` container, restores, runs `ANALYZE`, prints the 10 biggest tables by row count, and removes the container. It reads credentials from inside the Postgres container, so nothing secret is on the command line.

## Report
File name and size, "RESTORE OK", and the table row counts. Only then say "safe to proceed".

If the service isn't named `postgres`, run with `PG_SERVICE=<name>`: `ssh posgro-vps 'cd ~/posgro && PG_SERVICE=db bash -s' < ...`. If Postgres auth fails (SCRAM), the `.env` credentials drifted from the initialized volume: fix inside the container with `ALTER USER`, never by deleting the volume.

Never delete existing backups without asking. Keep at least the last 7; copying one off the server is the user's call.
