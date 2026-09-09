# Supernizo notification sync v1

Autocall is the source of truth for Autocall notifications. The Supernizo backend stores a
per-user projection so its existing notification API and dashboard can present those events.

The wire schemas are defined in `packages/shared/src/contracts.ts` as:

- `NotificationSyncPageRequestSchema`
- `NotificationSyncPageResponseSchema`
- `NotificationSyncItemSchema`
- `NotificationSyncCursorSchema`

The producer endpoint is
`POST /autocall-db/api/internal/integrations/supernizo/notifications/page`. It is disabled unless
`SUPERNIZO_NOTIFICATION_SYNC_ENABLED=true` and authenticates the exact request body with the
dedicated `SUPERNIZO_NOTIFICATION_SYNC_SECRET` HMAC key.

## Page semantics

- `schemaVersion` is required and must equal `1`.
- Results are ordered ascending by `(createdAt, sourceNotificationId)`.
- `cursor` is exclusive. The next page contains only rows whose ordering tuple is greater than
  the supplied `(createdAt, id)` tuple.
- `nextCursor` is the tuple for the last returned row, or `null` when no rows are returned.
- A page contains at most 250 notifications; consumers should normally request 100.
- Retrying the same cursor is safe. Consumers insert with a deterministic deduplication key before
  advancing their Redis cursor.

## Identity and state

- When a visitor sends a chat message, Autocall creates one notification for every currently
  eligible Autocall user (active Supernizo users with Autocall access, plus local Autocall admins).
- `recipientSubject` is the Supernizo user UUID held in Autocall as `User.supernizoId`; internal
  Autocall users without that mapping are not exported.
- Before inserting the projection, the Supernizo worker rechecks that the recipient is active,
  is not a client user, and is either a super admin or still has the Autocall assignment.
- `sourceNotificationId` is the immutable Autocall notification ID.
- `createdAt` is the notification creation time.
- Autocall and Supernizo maintain their own read state. Read-state changes are not synchronized.

All timestamps are ISO 8601 UTC strings ending in `Z`. Unknown fields, unknown notification
types, non-UUID recipient subjects, and unsupported schema versions are rejected.

## v1 notification type

`CHAT_MESSAGE` includes the site, thread, message, and visitor identifiers needed to construct an
authenticated deep link from Supernizo to the matching Autocall conversation.

No notification database migration is required. Deploy both sides disabled, configure the same
dedicated secret, enable this producer first, and then enable the Supernizo polling worker.
