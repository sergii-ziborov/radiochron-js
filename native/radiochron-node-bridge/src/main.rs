use std::io::{self, BufRead, Write};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() -> anyhow::Result<()> {
    if std::env::args().any(|argument| argument == "--version") {
        println!("radiochron-node-bridge {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    for line in stdin.lock().lines() {
        let line = line.context("could not read Node adapter request")?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(request) => respond(request),
            Err(error) => Response {
                id: 0,
                result: None,
                error: Some(format!("invalid request: {error}")),
            },
        };
        serde_json::to_writer(&mut output, &response)?;
        output.write_all(b"\n")?;
        output.flush()?;
    }
    Ok(())
}

fn respond(request: Request) -> Response {
    let id = request.id;
    match handle(&request.method, &request.params) {
        Ok(result) => Response {
            id,
            result: Some(result),
            error: None,
        },
        Err(error) => Response {
            id,
            result: None,
            error: Some(format!("{error:#}")),
        },
    }
}

fn handle(method: &str, _params: &Value) -> anyhow::Result<Value> {
    match method {
        "ping" => Ok(json!({
            "engine": "radiochron",
            "core_version": "0.2.0",
            "transport": "node_adapter",
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH
        })),
        "wifi_status" => Ok(serde_json::to_value(radiochron::wlan::wifi_status()?)?),
        "wifi_scan" => Ok(json!({ "interfaces_scanning": radiochron::wlan::bss::request_scan()? })),
        "wifi_networks" => {
            let collection = radiochron::wlan::bss::bss_list_detailed()?;
            Ok(json!({
                "count": collection.entries.len(),
                "networks": collection.entries,
                "interface_errors": collection.interface_errors
            }))
        }
        _ => anyhow::bail!("unsupported Node adapter method: {method}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_identifies_node_adapter_transport() {
        let result = handle("ping", &Value::Null).unwrap();
        assert_eq!(result["engine"], "radiochron");
        assert_eq!(result["transport"], "node_adapter");
    }

    #[test]
    fn unknown_methods_fail_closed() {
        assert!(handle("unknown", &Value::Null).is_err());
    }
}
