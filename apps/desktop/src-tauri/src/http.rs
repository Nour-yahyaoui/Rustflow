use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub const MAX_RESPONSE: usize = 5 * 1024 * 1024;
#[derive(Clone, Deserialize)]
pub struct Pair {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<Pair>,
    pub body: String,
    pub body_type: String,
    pub timeout_ms: u64,
    pub follow_redirects: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub base64: String,
    pub duration_ms: u128,
    pub size: usize,
    pub truncated: bool,
    pub url: String,
}
pub fn build_client() -> Result<Client, String> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .pool_max_idle_per_host(8)
        .connect_timeout(Duration::from_secs(15))
        .user_agent(concat!("RequestLab/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Could not initialize TLS HTTP client".into())
}
fn destination(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid request URL")?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP(S) URLs without embedded credentials are supported".into());
    }
    Ok(url)
}
fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Request timed out"
    } else if error.is_connect() {
        "Connection failed: check destination, proxy, network, and TLS certificate"
    } else if error.is_body() {
        "Response body transfer failed"
    } else {
        "HTTP protocol or network error"
    }
    .into()
}
pub async fn execute(
    client: &Client,
    input: HttpRequest,
    token: CancellationToken,
) -> Result<HttpResponse, String> {
    if input.method.len() > 30
        || input.url.len() > 16000
        || input.body.len() > MAX_RESPONSE
        || input.headers.len() > 200
        || !(100..=300_000).contains(&input.timeout_ms)
    {
        return Err("Request exceeds configured limits".into());
    }
    let timeout = input.timeout_ms;
    tokio::select! {
        _ = token.cancelled() => Err("Request cancelled".into()),
        result = tokio::time::timeout(Duration::from_millis(timeout), execute_inner(client, input)) =>
            result.map_err(|_| "Request timed out".to_string())?,
    }
}
async fn execute_inner(client: &Client, input: HttpRequest) -> Result<HttpResponse, String> {
    let mut url = destination(&input.url)?;
    let mut method =
        Method::from_bytes(input.method.as_bytes()).map_err(|_| "Invalid HTTP method")?;
    let mut headers = HeaderMap::new();
    for item in input
        .headers
        .iter()
        .filter(|p| p.enabled && !p.key.is_empty())
    {
        let name =
            HeaderName::from_bytes(item.key.as_bytes()).map_err(|_| "Invalid header name")?;
        let value = HeaderValue::from_str(&item.value).map_err(|_| "Invalid header value")?;
        headers.append(name, value);
    }
    let mut body = if method == Method::GET || method == Method::HEAD || input.body_type == "none" {
        None
    } else {
        Some(input.body)
    };
    let started = Instant::now();
    for redirects in 0..=10 {
        let mut builder = client
            .request(method.clone(), url.clone())
            .headers(headers.clone());
        if let Some(value) = &body {
            builder = builder.body(value.clone());
        }
        let response = builder.send().await.map_err(network_error)?;
        let status = response.status();
        if input.follow_redirects && [301, 302, 303, 307, 308].contains(&status.as_u16()) {
            if let Some(location) = response.headers().get("location") {
                if redirects == 10 {
                    return Err("Too many redirects".into());
                }
                let next = url
                    .join(location.to_str().map_err(|_| "Invalid redirect")?)
                    .map_err(|_| "Invalid redirect URL")?;
                destination(next.as_str())?;
                // Deliberately stricter than browsers: custom credentials must never cross origins.
                if next.origin() != url.origin() {
                    return Err("Cross-origin redirect blocked. Send a new request to the target explicitly".into());
                }
                if status.as_u16() == 303
                    || ([301, 302].contains(&status.as_u16()) && method == Method::POST)
                {
                    method = Method::GET;
                    body = None;
                    headers.remove("content-type");
                }
                url = next;
                continue;
            }
        }
        let response_headers = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    String::from_utf8_lossy(v.as_bytes()).to_string(),
                )
            })
            .collect();
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        let mut truncated = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(network_error)?;
            let available = MAX_RESPONSE - bytes.len();
            bytes.extend_from_slice(&chunk[..chunk.len().min(available)]);
            if chunk.len() >= available {
                truncated = true;
                break;
            }
        }
        return Ok(HttpResponse {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or("").into(),
            headers: response_headers,
            body: String::from_utf8_lossy(&bytes).to_string(),
            base64: STANDARD.encode(&bytes),
            duration_ms: started.elapsed().as_millis(),
            size: bytes.len(),
            truncated,
            url: url.to_string(),
        });
    }
    Err("Redirect limit exceeded".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn destinations_reject_unsafe_schemes_and_credentials() {
        assert!(destination("file:///etc/passwd").is_err());
        assert!(destination("https://user:password@example.com").is_err());
        assert!(destination("http://localhost:8080/api").is_ok());
    }
    #[tokio::test]
    async fn real_http_response() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 1024];
            let bytes_read = socket.read(&mut buffer).await.unwrap();
            assert!(bytes_read > 0);
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true}").await.unwrap();
        });
        let request = HttpRequest {
            method: "GET".into(),
            url: format!("http://{address}"),
            headers: vec![],
            body: String::new(),
            body_type: "none".into(),
            timeout_ms: 3000,
            follow_redirects: true,
        };
        let result = execute(&build_client().unwrap(), request, CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.body, "{\"ok\":true}");
    }
}
