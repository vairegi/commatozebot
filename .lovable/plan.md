## Broadcast / Multi-channel Poster — Plan

### Decisions locked
- Content: text + forwarded/media
- UX: wizard (send/forward → pick channels → timing → confirm)
- Scheduling: post now OR post later, both with optional auto-delete (48h hard cap)
- Presets: "in 5m", "in 2h", "in 6h", "tomorrow 9am IST", + custom parser ("in 2h 5m")
- Timezone: IST (Asia/Kolkata) for all display/parsing
- Edit/cancel window: pending sends can be edited or cancelled; sent posts can have their auto-delete cancelled
- Per-channel independent deletes (each channel's timer fires on its own)
- Post identity: default channel post (no author)
- Failed sends: post to the rest, report which failed
- Permissions: any bot admin (normal + super)

### Schema (one migration)

**`broadcasts`** — one row per broadcast job
- `id`, `created_by` (tg user_id), `created_by_name`
- `source_chat_id`, `source_message_id` (for copyMessage)
- `preview_text` (short snippet for history UI)
- `scheduled_at` (nullable — null = send now)
- `auto_delete_seconds` (nullable, ≤172800)
- `status`: `pending` | `sending` | `sent` | `partial` | `failed` | `cancelled`
- `created_at`, `updated_at`, `sent_at`

**`broadcast_targets`** — one row per (broadcast, channel)
- `id`, `broadcast_id`, `chat_id`, `chat_title`
- `sent_message_id` (null until delivered)
- `status`: `pending` | `sent` | `failed` | `deleted` | `delete_failed`
- `error` (nullable)
- `delete_at` (nullable — when auto-delete fires)
- `deleted_at`

Admin-only RLS (via `has_role`) for dashboard reads.

### Wizard state

**`broadcast_drafts`** — one row per bot admin (upsert on tg user_id)
- `user_id`, `step` (`awaiting_content` | `awaiting_channels` | `awaiting_timing` | `awaiting_delete` | `confirm`)
- `source_chat_id`, `source_message_id`, `preview_text`
- `selected_chat_ids` (bigint[])
- `scheduled_at`, `auto_delete_seconds`
- `updated_at`

### Commands
- `/post` — start wizard (DM only); replies "send or forward the post you want to broadcast"
- `/broadcasts` — list recent broadcasts with inline buttons (view, cancel, cancel-delete)
- `/cancel` — abort current wizard draft

Also: if a bot admin sends/forwards a message in DM with no active wizard, prompt "Use /post first".

### Wizard flow
1. `/post` → sets draft to `awaiting_content`
2. Admin sends/forwards → store source ids + preview → show channel picker (inline keyboard listing chats where bot AND user are admin, multi-select toggle with ✅, "Done" button) → `awaiting_channels`
3. After Done → timing keyboard: [Post now] [in 5m] [in 2h] [in 6h] [tomorrow 9am] [Custom…] → `awaiting_timing`
   - Custom → free-text parser accepting "in 2h 5m", "in 45m", "tomorrow 3pm", "25 Jul 18:30"
4. Auto-delete keyboard: [No delete] [30m] [1h] [6h] [24h] [48h] [Custom…] (cap 48h) → `awaiting_delete`
5. Confirmation card: preview snippet + channel list + timing + delete → [Confirm] [Cancel]
6. Confirm → insert `broadcasts` + `broadcast_targets`; if `scheduled_at` is null, fire immediately

### Sending
Server function `sendBroadcast(broadcastId)`:
- Loop targets, `copyMessage` per channel (preserves media/formatting, no "forwarded from" tag → matches default identity)
- On success: store `sent_message_id`, set `delete_at = now + auto_delete_seconds` if set
- On failure: mark target failed with error
- Broadcast status becomes `sent` (all ok), `partial` (some failed), or `failed` (all failed)
- Report summary back to admin in DM

### Scheduler (pg_cron every minute)
Public route `/api/public/hooks/broadcast-tick` (apikey auth):
- Find `broadcasts` with `status='pending'` and `scheduled_at <= now()` → send
- Find `broadcast_targets` with `status='sent'` and `delete_at <= now()` → `deleteMessage`, mark `deleted` / `delete_failed`

### Cancel / edit
- `/broadcasts` inline buttons:
  - Pending (not yet sent): **Cancel** (status→cancelled) or **Edit** (rehydrate draft, restart wizard from timing step; content edits require new `/post`)
  - Sent with pending auto-deletes: **Cancel auto-delete** (clear `delete_at` on remaining targets)

### Files to add/change
- Migration: create 3 tables + RLS + grants + indexes on `scheduled_at`, `delete_at`, `status`
- `src/routes/api/public/telegram/webhook.ts` — add `/post`, `/broadcasts`, `/cancel`, callback_query handling, and free-text draft handling
- `src/routes/api/public/hooks/broadcast-tick.ts` — new cron endpoint
- `src/lib/broadcast.server.ts` — send + delete workers, timing parser (IST-aware via date-fns-tz)
- Register webhook to also receive `callback_query` updates
- pg_cron job: every minute → broadcast-tick
- Update `/help` text

### Dashboard (later, not this step)
Broadcasts page will read from these tables directly using admin RLS. Out of scope for this iteration.

Ready to build?
