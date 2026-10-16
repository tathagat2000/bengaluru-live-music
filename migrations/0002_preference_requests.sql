-- 0001 creates the idempotency ledger for fresh databases. This migration is
-- retained for databases that were initialized from the earlier 0001 draft.
CREATE TABLE IF NOT EXISTS preference_requests (
 user_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('neutral','wishlisted','not_interested')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
