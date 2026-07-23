mod chronicle;

use std::io::{self, BufRead, Write};
use std::time::Duration;

use anyhow::Context;
use chronicle::ChronicleService;
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

struct Bridge {
    chronicle: ChronicleService,
}

impl Bridge {
    fn new() -> Self {
        Self {
            chronicle: ChronicleService::new(),
        }
    }
}

fn main() -> anyhow::Result<()> {
    if std::env::args().any(|argument| argument == "--version") {
        println!("radiochron-node-bridge {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    let bridge = Bridge::new();
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    for line in stdin.lock().lines() {
        let line = line.context("could not read Node adapter request")?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(request) => respond(&bridge, request),
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
    let _ = bridge.chronicle.stop();
    Ok(())
}

fn respond(bridge: &Bridge, request: Request) -> Response {
    let id = request.id;
    match handle(bridge, &request.method, &request.params) {
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

fn handle(bridge: &Bridge, method: &str, params: &Value) -> anyhow::Result<Value> {
    let allowed: &[&str] = match method {
        "ping" | "wifi_status" | "wifi_scan" | "chronicle_stop" | "chronicle_status" => &[],
        "wifi_networks" | "wifi_analyze" => &["refresh_scan"],
        "wifi_sample" => &["interface_guid", "duration_seconds", "interval_ms"],
        "connectivity_diagnose" => &[
            "dns_name",
            "tcp_target",
            "internet_target",
            "captive_portal_url",
            "captive_portal_expected_status",
            "tls_target",
            "quality_target",
            "quality_attempts",
            "timeout_ms",
        ],
        "chronicle_start" => &["interval_seconds", "signal_threshold_db"],
        "chronicle_recent" => &["max_entries"],
        _ => anyhow::bail!("unsupported Node adapter method: {method}"),
    };
    reject_unknown_arguments(params, allowed)?;

    match method {
        "ping" => Ok(json!({
            "engine": "radiochron",
            "core_version": "0.3.0",
            "transport": "node_adapter",
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH
        })),
        "wifi_status" => Ok(serde_json::to_value(radiochron::wlan::wifi_status()?)?),
        "wifi_scan" => Ok(json!({
            "interfaces_scanning": radiochron::wlan::bss::request_scan()?
        })),
        "wifi_networks" => collect_networks(params),
        "wifi_analyze" => analyze_environment(params),
        "wifi_sample" => sample_connection(params),
        "connectivity_diagnose" => diagnose_connectivity(params),
        "chronicle_start" => {
            let interval = bounded_u64(params, "interval_seconds", 5, 1, 300)?;
            let threshold = bounded_i32(params, "signal_threshold_db", 8, 1, 50)?;
            bridge
                .chronicle
                .start(Duration::from_secs(interval), threshold)
        }
        "chronicle_stop" => bridge.chronicle.stop(),
        "chronicle_status" => Ok(bridge.chronicle.status()),
        "chronicle_recent" => {
            let max = bounded_u64(params, "max_entries", 100, 1, 1000)? as usize;
            bridge.chronicle.recent(max)
        }
        _ => unreachable!("known methods were validated above"),
    }
}

fn collect_networks(params: &Value) -> anyhow::Result<Value> {
    let refresh = if optional_bool(params, "refresh_scan", false)? {
        Some(radiochron::wlan::bss::scan_and_wait(Duration::from_secs(
            12,
        ))?)
    } else {
        None
    };
    let collection = radiochron::wlan::bss::bss_list_detailed()?;
    Ok(json!({
        "count": collection.entries.len(),
        "cache_age_seconds": radiochron::wlan::bss::last_refresh_age_seconds(),
        "refresh": refresh,
        "networks": collection.entries,
        "interface_errors": collection.interface_errors
    }))
}

fn analyze_environment(params: &Value) -> anyhow::Result<Value> {
    let refresh = if optional_bool(params, "refresh_scan", false)? {
        Some(radiochron::wlan::bss::scan_and_wait(Duration::from_secs(
            12,
        ))?)
    } else {
        None
    };
    let collection = radiochron::wlan::bss::bss_list_detailed()?;
    let statuses = radiochron::wlan::wifi_status()?;
    let connection = statuses
        .iter()
        .find_map(|status| status.connection.as_ref());
    Ok(json!({
        "cache_age_seconds": radiochron::wlan::bss::last_refresh_age_seconds(),
        "refresh": refresh,
        "interface_errors": collection.interface_errors,
        "analysis": radiochron::wlan::analyze::analyze(&collection.entries, connection)
    }))
}

fn sample_connection(params: &Value) -> anyhow::Result<Value> {
    let duration = bounded_u64(params, "duration_seconds", 20, 1, 120)?;
    let interval = bounded_u64(params, "interval_ms", 1000, 250, 60_000)?;
    let interface = optional_string(params, "interface_guid")?;
    Ok(serde_json::to_value(
        radiochron::wlan::sample::sample_connection_on(interface, duration, interval)?,
    )?)
}

fn diagnose_connectivity(params: &Value) -> anyhow::Result<Value> {
    let config = radiochron::connectivity::ConnectivityConfig {
        dns_name: bounded_optional_string(params, "dns_name", 253)?,
        tcp_target: bounded_optional_string(params, "tcp_target", 512)?,
        internet_target: bounded_optional_string(params, "internet_target", 512)?,
        captive_portal_url: bounded_optional_string(params, "captive_portal_url", 2048)?,
        captive_portal_expected_status: bounded_u64(
            params,
            "captive_portal_expected_status",
            204,
            100,
            599,
        )? as u16,
        tls_target: bounded_optional_string(params, "tls_target", 512)?,
        quality_target: bounded_optional_string(params, "quality_target", 512)?,
        quality_attempts: bounded_u64(params, "quality_attempts", 4, 1, 20)? as u8,
        timeout: Duration::from_millis(bounded_u64(params, "timeout_ms", 3_000, 100, 30_000)?),
    };
    Ok(serde_json::to_value(radiochron::connectivity::diagnose(
        &config,
    ))?)
}

fn reject_unknown_arguments(params: &Value, allowed: &[&str]) -> anyhow::Result<()> {
    if params.is_null() {
        return Ok(());
    }
    let object = params
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("method parameters must be an object"))?;
    if let Some(name) = object.keys().find(|name| !allowed.contains(&name.as_str())) {
        anyhow::bail!("unknown parameter: {name}");
    }
    Ok(())
}

fn optional_bool(params: &Value, name: &str, default: bool) -> anyhow::Result<bool> {
    match params.get(name) {
        None => Ok(default),
        Some(value) => value
            .as_bool()
            .ok_or_else(|| anyhow::anyhow!("{name} must be a boolean")),
    }
}

fn optional_string<'a>(params: &'a Value, name: &str) -> anyhow::Result<Option<&'a str>> {
    match params.get(name) {
        None => Ok(None),
        Some(value) => value
            .as_str()
            .map(Some)
            .ok_or_else(|| anyhow::anyhow!("{name} must be a string")),
    }
}

fn bounded_optional_string(
    params: &Value,
    name: &str,
    max_len: usize,
) -> anyhow::Result<Option<String>> {
    let Some(value) = optional_string(params, name)? else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() || value.len() > max_len {
        anyhow::bail!("{name} must contain 1..={max_len} bytes");
    }
    Ok(Some(value.to_string()))
}

fn bounded_u64(
    params: &Value,
    name: &str,
    default: u64,
    min: u64,
    max: u64,
) -> anyhow::Result<u64> {
    let Some(value) = params.get(name) else {
        return Ok(default);
    };
    let value = value
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("{name} must be a non-negative integer"))?;
    if !(min..=max).contains(&value) {
        anyhow::bail!("{name} must be between {min} and {max}");
    }
    Ok(value)
}

fn bounded_i32(
    params: &Value,
    name: &str,
    default: i32,
    min: i32,
    max: i32,
) -> anyhow::Result<i32> {
    let Some(value) = params.get(name) else {
        return Ok(default);
    };
    let value = value
        .as_i64()
        .ok_or_else(|| anyhow::anyhow!("{name} must be an integer"))?;
    if value < i64::from(min) || value > i64::from(max) {
        anyhow::bail!("{name} must be between {min} and {max}");
    }
    Ok(value as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_identifies_node_adapter_transport() {
        let result = handle(&Bridge::new(), "ping", &json!({})).unwrap();
        assert_eq!(result["engine"], "radiochron");
        assert_eq!(result["transport"], "node_adapter");
    }

    #[test]
    fn unknown_methods_and_parameters_fail_closed() {
        let bridge = Bridge::new();
        assert!(handle(&bridge, "unknown", &Value::Null).is_err());
        assert!(handle(&bridge, "wifi_status", &json!({"surprise": true})).is_err());
    }

    #[test]
    fn bounded_parameters_reject_values_outside_the_contract() {
        assert!(sample_connection(&json!({"duration_seconds": 0})).is_err());
        assert!(diagnose_connectivity(&json!({"timeout_ms": 99})).is_err());
    }
}
