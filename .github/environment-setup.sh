#!/bin/bash
# Cloud environment setup script — sunprema/books
#
# ─────────────────────────────────────────────────────────────────────────────
# REFERENCE COPY. This file is NOT executed from the repository.
#
# The setup script lives in the cloud environment's configuration, not in git.
# To apply it: claude.ai/code -> environment settings dialog -> "Setup script",
# and paste the contents below. This copy exists so the environment config is
# reviewable next to the automation that depends on it; editing it here changes
# nothing until it is pasted into that dialog.
# ─────────────────────────────────────────────────────────────────────────────
#
# What it does: installs the bookbank plugin so its skills are resolvable when
# Claude Code launches, instead of a session falling back to reading the
# plugin's SKILL.md files off disk.
#
# Why it is needed even though .claude/settings.json already declares the
# plugin: `extraKnownMarketplaces` NAMES the marketplace, it does not fetch it.
# A fresh container has no local copy of `kit`, and the install then fails:
#
#   Failed to install plugin "bookbank@kit": Plugin "bookbank" not found in
#   marketplace "kit". Your local copy may be out of date.
#
# Fetching the marketplace first is the fix.
#
# Contract this script is written against:
#   * Runs as root on Ubuntu 24.04, before Claude Code launches.
#   * MUST exit 0 — a non-zero exit makes the session fail to start.
#   * Skipped when a cached environment snapshot exists. The snapshot includes
#     ~/.claude/plugins, so the plugin persists without re-running.
#   * Re-runs when the script changes, the allowed hosts change, or the cache
#     expires (~7 days) — so it must be idempotent. It is.
#   * Needs network access to github.com (covered by the Trusted level).
#
# A SessionStart hook is NOT a substitute: hooks run after Claude Code has
# launched, which is the window this exists to close. Use a hook only if you
# additionally want `claude plugin marketplace update kit` on every session, so
# a long-lived environment cache does not pin an old kit commit.

set -uo pipefail

log() { echo "[setup] $*"; }

MARKETPLACE_SOURCE="sunprema/kit"
MARKETPLACE_NAME="kit"
PLUGIN="bookbank@kit"

# 1. Fetch the marketplace. `add` is idempotent: it exits 0 and reports
#    "already on disk" when the snapshot already carried it.
log "adding marketplace ${MARKETPLACE_SOURCE}"
claude plugin marketplace add "${MARKETPLACE_SOURCE}" \
  || log "WARN: marketplace add failed — the plugin install below will likely fail too"

# 2. Best-effort refresh, so a rebuilt cache picks up newer kit commits.
#    Never fatal: a stale-but-working copy beats a session that will not start.
claude plugin marketplace update "${MARKETPLACE_NAME}" \
  || log "WARN: marketplace refresh failed — continuing with the copy on disk"

# 3. Install the plugin. Also idempotent.
log "installing ${PLUGIN}"
claude plugin install "${PLUGIN}" \
  || log "WARN: plugin install failed — sessions will fall back to on-disk skill files"

# 4. Print the result into the setup log, so a failure is visible here rather
#    than surfacing later as an unexplained missing skill.
log "result:"
claude plugin list || true

exit 0
