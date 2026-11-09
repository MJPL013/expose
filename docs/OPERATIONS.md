# Local operations

Code-audited 31 October 2026. See [status](STATUS.md), [database/retention](DATABASE.md) and [voice evidence](VOICE.md). These are local CLI tools, not a deployed administrative dashboard.

Run operator commands from `backend/`; they are not exposed as public HTTP endpoints. They use backend-only configuration and the same PostgreSQL/media adapters.

```powershell
npm run operator -- ai-off
npm run operator -- ai-on
npm run operator -- poll
npm run operator -- purge
npm run operator -- evaluate path/to/evaluation.json
npm run operator -- cancel-evaluation EVALUATION_UUID
npm run operator -- rate path/to/rates.json
npm run operator -- reconcile path/to/provider-invoice-entry.json
npm run report -- RUN_UUID
npm run report
```

`ai-off` creates a local stop file checked before reservations and during active voice/host work. Clearing it does not override `AI_ENABLED=false`. Keep both the stop file and backend environment out of frontend assets. Typing always remains available.

Evaluation JSON: `{ "mediaId": "UUID", "denoise": true, "reference": "consented reference text" }`. It requires an unexpired diagnostic recording, explicit consent, live AI enabled and an HTTPS callback origin. Never store reference files in the 90-day cost report directory; delete them within the diagnostic window.

Rate import is an array of `{ "provider": "gnani", "model": "account-model", "unit": "sttSeconds", "price": "confirmed-price-per-unit", "currency": "INR", "version": "account-price-version", "effectiveAt": "ISO-date" }`. Other supported units include TTS characters, input/output tokens, billed units and diagnostic seconds. Supply actual account prices. Do not price one token category and silently omit another.

Invoice reconciliation JSON: `{ "attemptId": "UUID", "cost": "actual-amount", "currency": "INR", "providerRequestId": "provider-evidence-id" }`. This updates reconciled cost, preserving the original estimate/rate snapshot. Promotional credits belong in invoice interpretation, not fake zero consumption.

After a process crash, restart PostgreSQL if needed, apply migrations and start the root server. Persisted actions/deadlines recover. Pending provider attempts with uncertain remote completion require reconciliation; do not retry blindly. Acknowledged game intents can safely be resent with the same ID.

`main.ts` starts pg-boss and performs a deadline catch-up before listening. `jobs.ts` scans active rooms every 500 ms; batch reconciliation is enqueued every 30 seconds with a minute cron fallback, and content purge is scheduled each minute. There is no per-round pg-boss job and no Redis requirement. The current worker queues are `batch-reconcile` and `content-purge` plus pg-boss's internal queue.

The health endpoint is a configuration/process check only. Check PostgreSQL separately with `pg_isready` and inspect sanitized migration/job metadata. A healthy endpoint does not confirm an Evon contract, account quota, successful speech recognition, working speakers or database readiness.

If a diagnostic create call times out before returning a provider job ID, identify it in the provider account before retrying. If consent is revoked, local results are cleared immediately and cancellation is retried by reconciliation. Local deletion cannot guarantee provider-side erasure.

Current purge gaps are explicit in [DATABASE.md](DATABASE.md#retention-as-implemented): global guest profiles and expired room/code rows remain, no backup retention/restore system exists, and provider cancellation can fail before local expiry deletion. Do not describe `purge` as complete account erasure.

Do not include `.env`, database dumps, audio, private snapshots, callback tokens or reference text in logs or support bundles. Keep current implementation status in `work-log/STATUS.md` and append actual changes/checks to `work-log/PROJECT_LOG.md`.
