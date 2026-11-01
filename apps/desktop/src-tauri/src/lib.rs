mod http;
mod storage;
mod websocket;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
use tokio_util::sync::CancellationToken;
pub struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    client: reqwest::Client,
    cancellations: Mutex<HashMap<String, CancellationToken>>,
    sockets: websocket::Sockets,
}
#[tauri::command]
async fn load_workspace(state: State<'_, AppState>) -> Result<Option<Value>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let guard = db.lock().map_err(|_| "Storage lock failed")?;
        storage::load(&guard)
    })
    .await
    .map_err(|_| "Storage task failed")?
}
#[tauri::command]
async fn save_workspace(state: State<'_, AppState>, workspace: Value) -> Result<(), String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let mut guard = db.lock().map_err(|_| "Storage lock failed")?;
        storage::save(&mut guard, workspace)
    })
    .await
    .map_err(|_| "Storage task failed")?
}
#[tauri::command]
async fn execute_request(
    state: State<'_, AppState>,
    id: String,
    request: http::HttpRequest,
) -> Result<http::HttpResponse, String> {
    let token = CancellationToken::new();
    {
        let mut map = state
            .cancellations
            .lock()
            .map_err(|_| "Request state lock failed")?;
        if map.len() >= 16 {
            return Err("Too many concurrent requests".into());
        }
        if map.contains_key(&id) {
            return Err("Duplicate request identifier".into());
        }
        map.insert(id.clone(), token.clone());
    }
    let result = http::execute(&state.client, request, token).await;
    if let Ok(mut map) = state.cancellations.lock() {
        map.remove(&id);
    }
    result
}
#[tauri::command]
fn cancel_request(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(token) = state
        .cancellations
        .lock()
        .map_err(|_| "Request state lock failed")?
        .get(&id)
    {
        token.cancel();
    }
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("requestlab=info")
        .init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let db =
                storage::open(&directory.join("requestlab.db")).map_err(std::io::Error::other)?;
            let client = http::build_client().map_err(std::io::Error::other)?;
            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
                client,
                cancellations: Mutex::new(HashMap::new()),
                sockets: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            execute_request,
            cancel_request,
            websocket::ws_connect,
            websocket::ws_send,
            websocket::ws_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("RequestLab could not start");
}
