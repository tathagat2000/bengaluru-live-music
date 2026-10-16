CREATE TABLE IF NOT EXISTS user_preferences (
 user_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('wishlisted','not_interested')),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,event_id)
);
CREATE INDEX IF NOT EXISTS idx_preferences_user ON user_preferences(user_id);
CREATE TABLE IF NOT EXISTS preference_requests (
 user_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('neutral','wishlisted','not_interested')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
