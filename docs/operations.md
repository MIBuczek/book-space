# Operations runbook

This document covers the operational duties the rewrite takes over from Firebase (T060, issue
#127): backup and restore, retention, disaster recovery, and the cut-over that retires the legacy
system. It is the answer to `spec.md` §9 open question 7 ("what is the retention policy for
archived bookings?") and to the gap the issue names — Firebase previously absorbed these duties
and nothing in the rewrite replaced them.

The tooling is `tools/backup` (Nx project `backup`). Every command below is run through it.

## Backup

### Cadence and retention

| Item                     | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| Full backup cadence      | Daily, at 02:00 Europe/Warsaw                                 |
| Backup retention         | 35 daily archives, then one per month for 12 months           |
| Archive format           | Extended JSON, one file per collection plus `manifest.json`   |
| Off-site copy            | The archive directory is replicated off the database host     |
| Encryption at rest       | The replication target encrypts at rest; archives are not otherwise encrypted by this tool |

The cadence is a daily full dump. The data set is small (a municipal booking calendar), so an
incremental scheme would add operational complexity — and a restore path — for no benefit a full
dump does not already give.

A backup is only as good as its last tested restore. **Run the restore rehearsal below at least
once a month and after any schema change**, and record the run in the deployment log.

### Taking a backup

```bash
nx run backup:run -- backup \
  --source "$DB_URI" \
  --out /var/backups/book-space/$(date +%Y-%m-%d)
```

The command writes `users.json`, `clients.json`, `buildings.json`, `bookings.json` and
`manifest.json` into the output directory. The manifest records the document count per
collection, which is the figure the restore reconciles against.

`bookedTimes` is embedded in each booking document, so it is not a separate file — the booking
file contains its slots.

### Restore procedure

A restore is destructive: it **replaces** each collection in the target database rather than
merging into it. A leftover document the archive does not contain would be a record the backup
does not cover, so the restore deletes first and inserts the archive's documents.

1. **Restore into a scratch database first.** Never restore directly over production without a
   rehearsal against a copy:

   ```bash
   nx run backup:run -- restore --target "$SCRATCH_DB_URI" --from /var/backups/book-space/2026-11-08
   ```

2. **Verify the scratch restore** against the source the archive was taken from:

   ```bash
   nx run backup:run -- verify-restore --source "$DB_URI" --target "$SCRATCH_DB_URI"
   ```

   Verification compares the two databases by document count **and** by a canonical
   Extended-JSON rendering of every document, so a restore that coerced an `ObjectId` into a hex
   string or a `Date` into an ISO string fails here rather than at cut-over. A non-zero exit code
   is a failed verification.

3. **Only then restore over production**, and only after stopping the API so no writes race the
   replacement:

   ```bash
   nx run backup:run -- restore --target "$DB_URI" --from /var/backups/book-space/2026-11-08
   ```

   Restart the API afterwards. The indexes are declared on the schemas and rebuilt on first use,
   so no index step is needed.

### Restore rehearsal record

The rehearsal below was performed on 2026-11-08 against an ephemeral `mongod` (the same server
`nx test` uses), which is the scratch environment available outside production. It exercises the
real commands end to end — no mocks.

```
$ nx run backup:run -- backup --source mongodb://127.0.0.1:42315/book_space_prod --out /tmp/rehearsal-archive
Backup written to /tmp/rehearsal-archive.
  2026-11-10T22:06:08.000Z  book_space_prod
  users      1
  clients    1
  buildings  2
  bookings   1

$ nx run backup:run -- restore --target mongodb://127.0.0.1:42315/book_space_scratch --from /tmp/rehearsal-archive
Restore complete into book_space_scratch.
  2026-11-10T22:06:08.000Z  book_space_prod
  users      1
  clients    1
  buildings  2
  bookings   1

$ nx run backup:run -- verify-restore --source mongodb://127.0.0.1:42315/book_space_prod --target mongodb://127.0.0.1:42315/book_space_scratch
Restore verification passed for 4 collections.
```

The round trip is also pinned by `tools/backup/src/lib/archive.spec.ts`, which asserts that an
`ObjectId` and a `Date` survive the dump and restore as their original types.

## Retention

### Policy

**Archived bookings are retained for five years after the last day they occupy a slot, then
purged.** Active bookings are never purged, whatever their age. This is the answer to open
question 7.

The anchor is the booking's **last slot day**, not `modifiedAt`. `modifiedAt` is stamped by every
write (approval, a slot change, archive — FR-016), so a booking archived years ago and re-saved
once would have its retention clock reset by an unrelated edit. The last slot day is immutable
once the booking is done and is the point the record stopped being operationally live.

Five years is the window a municipal entity can defend for booking history that underpins
published summaries: long enough to answer a dispute or an audit across the period a report can
cover, short enough that the collection does not grow without bound. The window is a default
(`DEFAULT_RETENTION_YEARS`), overridable per run with `--retention-years`.

### Running the purge

Run a dry run first; it reports what would be deleted and touches nothing:

```bash
nx run backup:run -- purge --target "$DB_URI" --dry-run
```

Then run it for real, exporting the removed documents so a purged booking can still be produced
if a question is asked about it:

```bash
nx run backup:run -- purge \
  --target "$DB_URI" \
  --export /var/backups/book-space/purged/$(date +%Y-%m-%d)
```

Run the purge on the same schedule as the backup — the daily job backs up and then purges, so a
purge is always preceded by a fresh archive.

The `skipped` counter is the one to watch. It counts candidates the database filter matched that
the pure predicate then refused; a non-zero value means the filter is wider than the rule, which
is a signal to look at it, not a data error.

## Disaster recovery

| Item                              | Target                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| **RPO** (recovery point objective) | 24 hours — the daily backup cadence                        |
| **RTO** (recovery time objective)  | 4 hours — provision MongoDB, restore the latest archive, verify, restart the API |

The API is stateless (all state is in MongoDB, the session token is a JWT), so a recovery is
"restore the database and restart the containers". The four-hour RTO assumes the latest archive
is available and the host can be reprovisioned from the image; a restore itself takes minutes.

The purge is the one irreversible operation. If a purge has to be undone, restore the archive
written by `--export` (it is a normal archive of the removed bookings) or, failing that, the
daily backup taken before the purge.

## Cut-over: retiring the legacy system

After the migrated data is live, the legacy Firebase project and the Netlify deployment must be
taken out of service. Leaving them running means the migrated data has a **writable second copy**
and the API keys committed in the legacy repository (the leak T001 found) stay exploitable.

Do these in order:

1. **Final legacy export.** Run the migration tool's export against the legacy Firebase project
   one last time, after the new system has been live long enough that no further writes are
   expected on the old one (at least one full booking cycle).

   ```bash
   nx run migration:run -- --source <legacy-export-dir> --target "$DB_URI"
   ```

2. **Reconcile.** The migration's report is the gate: every record must be written and every
   reference must resolve (`SC-003`). A non-zero exit code means the cut-over stops here. Re-run
   the verification against the live database with `nx run backup:run -- verify-restore` if the
   counts are in question.

3. **Freeze the legacy app.** Take the Netlify deployment offline (or replace it with a static
   "this service has moved" page) so the old SPA can no longer read or write the Firebase data.

4. **Revoke the legacy credentials.** In the Firebase console, delete or disable every API key
   the legacy app used, and revoke the service account keys. The keys are in the legacy
   repository's git history and must be treated as public — rotating them is not enough if the
   project still exists.

5. **Disable the Firebase project.** Once the keys are revoked and the app is frozen, take the
   Firebase project out of service (disable billing, then delete the project after the retention
   period that any provider requires). This removes the writable second copy of the data.

6. **Record the cut-over.** Note the date, the final reconciliation counts and the archive
   location in the deployment log.

Until step 5 is complete, the legacy system is a live copy of the migrated data and the leaked
keys remain a risk — the cut-over is not finished at step 2.
