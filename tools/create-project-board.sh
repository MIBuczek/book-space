#!/usr/bin/env bash
#
# Create the "Book Space App" GitHub Project (v2) and add the rewrite backlog to it.
#
# The backlog issues already exist in MIBuczek/book-space with phase milestones
# (see specs/001-booking-platform-rewrite/tasks.md). This script creates the project
# board, adds every issue to it, and fills a single-select "Phase" field from each
# issue's milestone so the board can be grouped by delivery phase.
#
# Requirements
#   - gh CLI authenticated as the repository owner
#   - A token with the `project` scope. For a classic PAT: `gh auth refresh -s project`.
#     A GitHub App installation token cannot create projects.
#
# Usage
#   ./tools/create-project-board.sh                 # owner MIBuczek, title "Book Space App"
#   ./tools/create-project-board.sh my-owner "My Board"

set -euo pipefail

OWNER="${1:-MIBuczek}"
TITLE="${2:-Book Space App}"
REPO="${OWNER}/book-space"

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

echo "Owner:  ${OWNER}"
echo "Title:  ${TITLE}"
echo "Repo:   ${REPO}"

# ---------------------------------------------------------------- project
if ! gh project list --owner "${OWNER}" --format json 2>/dev/null \
     | jq -e --arg t "${TITLE}" '.projects[] | select(.title == $t)' >/dev/null; then
   echo "Creating project '${TITLE}'..."
   gh project create --owner "${OWNER}" --title "${TITLE}"
else
   echo "Project '${TITLE}' already exists."
fi

PROJECT_NUMBER="$(gh project list --owner "${OWNER}" --format json \
   | jq -r --arg t "${TITLE}" '.projects[] | select(.title == $t) | .number')"
PROJECT_ID="$(gh project view "${PROJECT_NUMBER}" --owner "${OWNER}" --format json | jq -r '.id')"
echo "Project number: ${PROJECT_NUMBER} (${PROJECT_ID})"

# ---------------------------------------------------------------- phase field
PHASE_FIELD="Phase"
if ! gh project field-list "${PROJECT_NUMBER}" --owner "${OWNER}" --format json \
     | jq -e --arg f "${PHASE_FIELD}" '.fields[] | select(.name == $f)' >/dev/null; then
   echo "Creating single-select field '${PHASE_FIELD}'..."
   gh project field-create "${PROJECT_NUMBER}" --owner "${OWNER}" \
      --name "${PHASE_FIELD}" --data-type SINGLE_SELECT \
      --single-select-options "Phase 1 - Foundation & Security,Phase 2 - Data Model & Reference Data,Phase 3 - Authentication & Authorization,Phase 4 - Booking Domain Logic,Phase 5 - Reporting & Notifications,Phase 6 - Angular UI,Phase 7 - Migration & Cut-over,Phase 8 - Verification"
fi

# ---------------------------------------------------------------- add issues
echo "Adding issues..."
gh issue list --repo "${REPO}" --state all --limit 200 \
   --json number,title,milestone \
   | jq -c '.[] | select(.milestone != null)' \
   | while read -r issue; do
      number="$(jq -r '.number' <<<"${issue}")"
      title="$(jq -r '.title' <<<"${issue}")"
      phase="$(jq -r '.milestone.title' <<<"${issue}")"

      url="$(gh issue view "${number}" --repo "${REPO}" --json url --jq '.url')"
      if gh project item-add "${PROJECT_NUMBER}" --owner "${OWNER}" --url "${url}" >/dev/null 2>&1; then
         echo "  added #${number} ${title}"
      else
         echo "  skipped #${number} (already on the board or not addable)"
      fi

      # Tag the item with its phase. Item ids are resolved per call because the
      # list is paginated and item ids are only known after the add.
      item_id="$(gh project item-list "${PROJECT_NUMBER}" --owner "${OWNER}" --format json --limit 500 \
         | jq -r --arg n "${number}" '.items[] | select(.content.number == ($n | tonumber)) | .id' | head -1)"
      field_id="$(gh project field-list "${PROJECT_NUMBER}" --owner "${OWNER}" --format json \
         | jq -r --arg f "${PHASE_FIELD}" '.fields[] | select(.name == $f) | .id')"
      option_id="$(gh project field-list "${PROJECT_NUMBER}" --owner "${OWNER}" --format json \
         | jq -r --arg f "${PHASE_FIELD}" --arg p "${phase}" \
            '.fields[] | select(.name == $f) | .options[] | select(.name == $p) | .id')"
      if [ -n "${item_id}" ] && [ -n "${field_id}" ] && [ -n "${option_id}" ]; then
         gh project item-edit --id "${item_id}" --project-id "${PROJECT_ID}" \
            --field-id "${field_id}" --single-select-option-id "${option_id}" >/dev/null
      fi
   done

echo
echo "Done. Board: https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}"
