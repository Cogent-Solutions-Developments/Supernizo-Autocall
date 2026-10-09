# Chat follow-up

Visitors can optionally leave email, WhatsApp, or both in a dismissible form that fills the chat window. Both fields are shown together; filling either one is enough. WhatsApp numbers include the international country code. The close button, Escape key, and Maybe later action return to the conversation. The form opens after their first message or when staff are unavailable; visitors can also open it manually. Consent is unchecked by default and applies only to this conversation. Contact details are unverified.

Contact details, server-recorded consent time and consent version are stored on the PostgreSQL chat thread. Public responses acknowledge the save without returning personal details. Realtime events and inbox summaries do not contain email addresses or phone numbers. Authorized administrators and agents can view details and open their email or WhatsApp application to follow up manually. No messages are sent automatically.

Threads support Needs reply, Follow-up pending and Resolved. A new visitor message returns the thread to Needs reply. Follow-up pending requires saved contact details.

Migration: `20261008000000_chat_follow_up`. Apply through the normal migration deployment process before deploying the application. Local development and test databases have been migrated; production has not been changed.

Validation: `pnpm test:local`, `pnpm test:e2e:local contact-follow-up.spec.ts --workers=1`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. The local browser test requires the seeded development account and running local server.
