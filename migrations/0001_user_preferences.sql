-- Preferences are intentionally reset; do not import the legacy Sheet or D1 log.
DROP TABLE IF EXISTS preference_requests;
DROP TABLE IF EXISTS user_preferences;

CREATE TABLE user_preferences (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('neutral', 'wishlisted', 'not_interested')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX user_preferences_by_user_state
  ON user_preferences (user_id, state);
