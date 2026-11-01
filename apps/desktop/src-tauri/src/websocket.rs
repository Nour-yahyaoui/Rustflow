use crate::{http::Pair, AppState};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        http::{HeaderName, HeaderValue},
        protocol::{Message, WebSocketConfig},
    },
};
pub type Sockets = Mutex<HashMap<String, mpsc::Sender<Message>>>;
#[derive(Clone, Serialize)]
struct WsEvent {
    id: String,
    text: String,
    kind: String,
}
#[tauri::command]
pub async fn ws_connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: String,
    headers: Vec<Pair>,
) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid WebSocket URL")?;
    if !["ws", "wss"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Use a ws(s) URL without embedded credentials".into());
    }
    if headers.len() > 100 {
        return Err("Too many headers".into());
    }
    {
        let sockets = state.sockets.lock().map_err(|_| "Socket lock failed")?;
        if sockets.len() >= 8 || sockets.contains_key(&id) {
            return Err("Socket limit or duplicate identifier".into());
        }
    }
    let mut request = url
        .into_client_request()
        .map_err(|_| "Invalid WebSocket handshake")?;
    for pair in headers
        .into_iter()
        .filter(|p| p.enabled && !p.key.is_empty())
    {
        let name =
            HeaderName::from_bytes(pair.key.as_bytes()).map_err(|_| "Invalid header name")?;
        let value = HeaderValue::from_str(&pair.value).map_err(|_| "Invalid header value")?;
        request.headers_mut().insert(name, value);
    }
    let config = WebSocketConfig::default()
        .max_message_size(Some(1024 * 1024))
        .max_frame_size(Some(1024 * 1024));
    let (socket, _) = tokio::time::timeout(
        Duration::from_secs(15),
        connect_async_with_config(request, Some(config), false),
    )
    .await
    .map_err(|_| "WebSocket connection timeout")?
    .map_err(|_| "WebSocket handshake or TLS verification failed")?;
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(32);
    state
        .sockets
        .lock()
        .map_err(|_| "Socket lock failed")?
        .insert(id.clone(), tx);
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                outgoing=rx.recv()=>match outgoing {Some(message)=>{let close=matches!(&message,Message::Close(_));if sink.send(message).await.is_err()||close{break;}},None=>break},
                incoming=stream.next()=>match incoming{Some(Ok(Message::Text(text)))=>{let _=app.emit("ws-message",WsEvent{id:id.clone(),text:text.to_string(),kind:"message".into()});},Some(Ok(Message::Binary(bytes)))=>{let _=app.emit("ws-message",WsEvent{id:id.clone(),text:format!("[{} binary bytes]",bytes.len()),kind:"message".into()});},Some(Ok(Message::Ping(bytes)))=>{if sink.send(Message::Pong(bytes)).await.is_err(){break;}},Some(Ok(Message::Close(_)))|None=>break,Some(Err(_))=>{let _=app.emit("ws-message",WsEvent{id:id.clone(),text:"WebSocket transport error".into(),kind:"error".into()});break;},_=>{}}
            }
        }
        let state = app.state::<AppState>();
        if let Ok(mut sockets) = state.sockets.lock() {
            sockets.remove(&id);
        }
        let _ = app.emit(
            "ws-message",
            WsEvent {
                id,
                text: String::new(),
                kind: "closed".into(),
            },
        );
    });
    Ok(())
}
#[tauri::command]
pub async fn ws_send(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    if message.len() > 1024 * 1024 {
        return Err("Message exceeds 1 MB".into());
    }
    let sender = state
        .sockets
        .lock()
        .map_err(|_| "Socket lock failed")?
        .get(&id)
        .cloned()
        .ok_or("Socket is not connected")?;
    sender
        .send(Message::Text(message.into()))
        .await
        .map_err(|_| "Socket is closed".into())
}
#[tauri::command]
pub async fn ws_disconnect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let sender = state
        .sockets
        .lock()
        .map_err(|_| "Socket lock failed")?
        .remove(&id);
    if let Some(sender) = sender {
        sender
            .send(Message::Close(None))
            .await
            .map_err(|_| "Socket already closed")?;
    }
    Ok(())
}
use tauri::Manager;
