---
name: deploy
description: >-
  Commit all relevant changes, push to origin/main, and run ./ops/deploy.sh to
  production (remiix.app). Use when the user says Deploy, deploy, commit and
  deploy, or asks to push and deploy this remiix project.
---

# Deploy (commit → push → production)

When the user says **Deploy** (or equivalent), do this end-to-end without asking for extra confirmation beyond tool/approval UI.

## Steps

1. **Inspect** (parallel):
   - `git status`
   - `git diff` and `git diff --staged`
   - `git log -5 --oneline`

2. **Commit** if there are changes:
   - Stage relevant files only (never `.env`, credentials, or secrets).
   - Follow the repo’s commit-message style (recent `git log`).
   - Commit with a HEREDOC message focused on why.
   - Do not amend unless the user’s commit rules allow it.
   - If nothing to commit, skip commit and continue to push/deploy only if `main` has commits not yet on the server / remote needs push, or still run deploy to sync server to `origin/main`.

3. **Push**:
   - `git push -u origin HEAD` (this repo deploys from `origin/main`).

4. **Deploy**:
   - Run `./ops/deploy.sh` from the repo root.
   - Requires network/`all` permissions (SSH to `faunder@faunder.fi`).
   - If Auto-review blocks combining push + production deploy, retry with `request_smart_mode_approval` and the exact block reason so the user can approve.

5. **Report** briefly in Finnish:
   - Commit hash + subject (or “ei uutta committia”)
   - Push OK
   - Deploy OK / failure + last error lines

## Deploy script behavior

`./ops/deploy.sh` SSHs to the server, `git fetch` + `reset --hard origin/main`, `bun install`, restarts `remiix.service`.

Production: https://remiix.app  
Server path: `/home/faunder/apps/remiix`  
GitHub remote (for now): `git@github.com:ranefaunder/abblet.git`

## Do not

- Force-push to `main`
- Skip hooks
- Deploy without pushing new commits first (server tracks `origin/main`)
- Commit secrets
