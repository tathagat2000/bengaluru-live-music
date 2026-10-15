CREATE TABLE IF NOT EXISTS user_preferences (
 user_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('wishlisted','not_interested')),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,event_id)
);
CREATE INDEX IF NOT EXISTS idx_preferences_user ON user_preferences(user_id);
