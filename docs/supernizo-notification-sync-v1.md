# Supernizo notification sync v1

Autocall is the source of truth for Autocall notifications. The Supernizo backend stores a
per-user projection so its existing notification API and dashboard can present those events.

The wire schemas are defined in `packages/shared/src/contracts.ts` as:

- `NotificationSyncPageRequestSchema`
- `NotificationSyncPageResponseSchema`
- `NotificationSyncItemSchema`
- `NotificationSyncCursorSchema`

## Page semantics

- `schemaVersion` is required and must equal `1`.
- Results are ordered ascending by `(updatedAt, sourceNotificationId)`.
- `cursor` is exclusive. The next page contains only rows whose ordering tuple is greater than
  the supplied `(updatedAt, id)` tuple.
- `nextCursor` is the tuple for the last returned row, or `null` when no rows are returned.
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
