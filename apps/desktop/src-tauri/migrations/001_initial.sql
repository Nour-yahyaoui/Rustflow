PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS workspace_state(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL CHECK(json_valid(document)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, collection_id TEXT, name TEXT NOT NULL, method TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)));
CREATE INDEX IF NOT EXISTS requests_collection ON requests(collection_id);
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_queue(id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, base_version INTEGER NOT NULL, operation TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
PRAGMA user_version = 1;
