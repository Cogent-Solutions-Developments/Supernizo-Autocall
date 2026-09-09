# Supernizo notification sync v1

Autocall is the source of truth for Autocall notifications. The Supernizo backend stores a
per-user projection so its existing notification API and dashboard can present those events.

The wire schemas are defined in `packages/shared/src/contracts.ts` as:

- `NotificationSyncPageRequestSchema`
- `NotificationSyncPageResponseSchema`
- `NotificationSyncItemSchema`
- `NotificationSyncCursorSchema`

The producer endpoint is:

`POST /autocall-db/api/internal/integrations/supernizo/notifications/page`

It is available only when `SUPERNIZO_NOTIFICATION_SYNC_ENABLED=true`. Requests use the dedicated
`SUPERNIZO_NOTIFICATION_SYNC_SECRET` and include:

- `x-supernizo-timestamp`: a 10-digit Unix timestamp within five minutes of server time.
- `x-supernizo-signature`: lowercase hex HMAC-SHA256 of
  `timestamp + "\\n" + method + "\\n" + path + "\\n" + exactBody`.

The notification secret must contain at least 32 characters and must not be reused for SSO or
directory synchronization. Responses include `Cache-Control: no-store` and `x-request-id`.

## Page semantics

- `schemaVersion` is required and must equal `1`.
- Results are ordered ascending by `(updatedAt, sourceNotificationId)`.
- `cursor` is exclusive. The next page contains only rows whose ordering tuple is greater than
  the supplied `(updatedAt, id)` tuple.
- `nextCursor` is the tuple for the last returned row, or `null` when no rows are returned.
- When `nextCursor` is `null`, consumers retain their previously stored cursor.
- A page contains at most 250 notifications; consumers should normally request 100.
- Retrying the same cursor is safe. Consumers upsert by `(source, sourceNotificationId)` before
  advancing their stored cursor.

## Identity and state

- `recipientSubject` is the Supernizo user UUID held in Autocall as `User.supernizoId`; internal
  Autocall users without that mapping are not exported.
- `sourceNotificationId` is the immutable Autocall notification ID.
- `createdAt` is the notification creation time.
- `updatedAt` changes whenever exported state changes and is never earlier than `createdAt`.
- `readAt` is `null` until the notification has been read in Autocall. In v1, read state is
  monotonic: unread notifications may become read, but read notifications do not become unread.

All timestamps are ISO 8601 UTC strings ending in `Z`. Unknown fields, unknown notification
types, non-UUID recipient subjects, and unsupported schema versions are rejected.

## v1 notification type

`CHAT_MESSAGE` includes the site, thread, message, and visitor identifiers needed to construct an
authenticated deep link from Supernizo to the matching Autocall conversation.

## Rollout

1. Apply migration `20260910000000_add_notification_sync_cursor`.
2. Deploy Autocall with the notification flag disabled and a dedicated secret configured.
3. Deploy the matching Supernizo projection worker with the same secret.
4. Enable the Autocall notification feed and verify a signed empty-page request.
5. Enable scheduled polling in Supernizo and monitor cursor advancement and projection failures.
