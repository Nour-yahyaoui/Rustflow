use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::Path;
const PREFIX: &str = "__requestlab_vault:";
pub fn open(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path)
        .map_err(|_| "Could not open local database. Restore a backup or check file permissions")?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        .map_err(|_| "Could not configure SQLite")?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|_| "Could not read database version")?;
    if version > 1 {
        return Err(
            "Database was created by a newer RequestLab version. Upgrade before opening".into(),
        );
    }
    db.execute_batch(include_str!("../migrations/001_initial.sql"))
        .map_err(|_| "Database migration failed")?;
    let health: String = db
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|_| "Database integrity check failed")?;
    if health != "ok" {
        return Err("Database corruption detected. Existing files were preserved; restore a known-good backup".into());
    }
    Ok(db)
}
fn vault(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("dev.requestlab.desktop", id)
        .map_err(|_| "OS credential vault is unavailable")
}
fn sensitive(key: &str) -> bool {
    let key = key.to_lowercase();
    [
        "authorization",
        "cookie",
        "token",
        "password",
        "api-key",
        "apikey",
        "api_key",
        "secret",
    ]
    .iter()
    .any(|part| key.contains(part))
}
fn protect(value: &mut Value, parent: &str, created: &mut Vec<String>) -> Result<(), String> {
    match value {
        Value::Object(map) => {
            let secret_pair = map.get("secret").and_then(Value::as_bool).unwrap_or(false)
                || map
                    .get("key")
                    .and_then(Value::as_str)
                    .is_some_and(sensitive);
            for (key, child) in map.iter_mut() {
                let secret = (secret_pair && key == "value")
                    || (parent == "auth" && ["token", "password", "value"].contains(&key.as_str()));
                if secret {
                    if let Some(text) = child.as_str().filter(|s| !s.is_empty()) {
                        let id = uuid::Uuid::new_v4().to_string();
                        vault(&id)?.set_password(text).map_err(|_| {
                            "Unable to store secret in OS credential vault. Nothing was saved"
                        })?;
                        created.push(id.clone());
                        *child = Value::String(format!("{PREFIX}{id}"));
                    }
                } else {
                    protect(child, key, created)?;
                }
            }
        }
        Value::Array(values) => {
            for child in values {
                protect(child, parent, created)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn references(value: &Value, ids: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            if let Some(id) = text.strip_prefix(PREFIX) {
                ids.push(id.into());
            }
        }
        Value::Array(items) => {
            for item in items {
                references(item, ids);
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                references(item, ids);
            }
        }
        _ => {}
    }
}
fn hydrate(value: &mut Value) -> Result<(), String> {
    match value {
        Value::String(text) => {
            if let Some(id) = text.strip_prefix(PREFIX) {
                *text=vault(id)?.get_password().map_err(|_| "A secret cannot be read from the OS credential vault. Unlock the vault and retry")?;
            }
        }
        Value::Array(items) => {
            for item in items {
                hydrate(item)?;
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                hydrate(item)?;
            }
        }
        _ => {}
    }
    Ok(())
}
pub fn load(db: &Connection) -> Result<Option<Value>, String> {
    let mut stmt = db
        .prepare("SELECT document FROM workspace_state WHERE id=1")
        .map_err(|_| "Storage query failed")?;
    let mut rows = stmt.query([]).map_err(|_| "Storage query failed")?;
    match rows.next().map_err(|_| "Storage read failed")? {
        None => Ok(None),
        Some(row) => {
            let text: String = row.get(0).map_err(|_| "Invalid workspace data")?;
            let mut value: Value =
                serde_json::from_str(&text).map_err(|_| "Workspace JSON is corrupt")?;
            hydrate(&mut value)?;
            Ok(Some(value))
        }
    }
}
fn validate_workspace(workspace: &Value) -> Result<(), String> {
    if workspace["version"].as_u64() != Some(1) {
        return Err("Unsupported workspace version".into());
    }
    let mut ids = std::collections::HashSet::new();
    for (field, limit) in [
        ("requests", 10000),
        ("collections", 1000),
        ("environments", 100),
        ("history", 100),
        ("globalVariables", 1000),
    ] {
        let items = workspace[field]
            .as_array()
            .ok_or_else(|| format!("Invalid workspace field: {field}"))?;
        if items.len() > limit {
            return Err(format!("Too many {field}"));
        }
        if field == "requests" {
            for request in items {
                let id = request["id"].as_str().ok_or("Missing request identifier")?;
                if id.len() > 100 || !ids.insert(id) {
                    return Err("Duplicate or invalid request identifier".into());
                }
                let _: crate::http::HttpRequest = serde_json::from_value(request.clone())
                    .map_err(|_| "Invalid stored request")?;
                if request["name"]
                    .as_str()
                    .is_none_or(|name| name.is_empty() || name.len() > 200)
                {
                    return Err("Invalid request name".into());
                }
            }
        }
    }
    if !workspace["preferences"].is_object() {
        return Err("Invalid workspace preferences".into());
    }
    Ok(())
}
pub fn save(db: &mut Connection, mut workspace: Value) -> Result<(), String> {
    validate_workspace(&workspace)?;
    if workspace.get("version").and_then(Value::as_u64) != Some(1)
        || !workspace.get("requests").is_some_and(Value::is_array)
    {
        return Err("Invalid workspace format".into());
    }
    let text = serde_json::to_string(&workspace).map_err(|_| "Invalid workspace")?;
    if text.len() > 12_000_000 {
        return Err("Workspace exceeds 12 MB limit. Export and split collections".into());
    }
    let old: Option<String> = db
        .query_row("SELECT document FROM workspace_state WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| "Could not read previous workspace. Save aborted")?;
    let mut created = Vec::new();
    if let Err(error) = protect(&mut workspace, "", &mut created) {
        for id in created {
            if let Ok(entry) = vault(&id) {
                let _ = entry.delete_credential();
            }
        }
        return Err(error);
    }
    let outcome = (|| {
        let tx = db
            .transaction()
            .map_err(|_| "Could not start save transaction")?;
        tx.execute("INSERT INTO workspace_state(id,document) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET document=excluded.document,updated_at=CURRENT_TIMESTAMP",params![workspace.to_string()]).map_err(|_| "Could not save workspace")?;
        tx.execute("DELETE FROM requests", [])
            .map_err(|_| "Could not update request index")?;
        if let Some(requests) = workspace["requests"].as_array() {
            for request in requests {
                tx.execute("INSERT INTO requests(id,collection_id,name,method,document) VALUES(?1,?2,?3,?4,?5)",params![request["id"].as_str(),request["collectionId"].as_str(),request["name"].as_str(),request["method"].as_str(),request.to_string()]).map_err(|_| "Could not index request")?;
            }
        }
        tx.commit().map_err(|_| "Could not commit workspace")?;
        Ok::<(), String>(())
    })();
    if outcome.is_err() {
        for id in created {
            if let Ok(entry) = vault(&id) {
                let _ = entry.delete_credential();
            }
        }
    } else if let Some(old) = old {
        if let Ok(value) = serde_json::from_str::<Value>(&old) {
            let mut ids = Vec::new();
            references(&value, &mut ids);
            for id in ids {
                if let Ok(entry) = vault(&id) {
                    if entry.delete_credential().is_err() {
                        tracing::warn!("Could not clean an obsolete vault entry");
                    }
                }
            }
        }
    }
    outcome
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_and_integrity() {
        let db = open(Path::new(":memory:")).unwrap();
        assert!(load(&db).unwrap().is_none());
        let version: i64 = db
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }
    #[test]
    fn invalid_workspace_is_rejected() {
        let mut db = open(Path::new(":memory:")).unwrap();
        assert!(save(&mut db, serde_json::json!({"version":2})).is_err());
    }
}
