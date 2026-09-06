//! Incident and Windows history methods for the Node bridge.
//!
//! Cause semantics live in `radiochron::incident::classify`. This module only
//! collects and normalises evidence for that classifier.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use blazingly_json::{json, Value};
use radiochron::connectivity::{ConnectivityConfig, ConnectivityReport, StageStatus};
use radiochron::incident::{
    classify, ConnectivityEvidence, EvidenceSection, HistoryEvidence, IncidentEvidence,
    WifiAnalysisEvidence, WifiInterfaceSnapshot, WifiStatusEvidence,
};

use super::{bounded_u64, optional_bool, reject_unknown_arguments};

#[cfg(not(windows))]
const HISTORY_UNAVAILABLE: &str =
    "native WLAN event history is currently available on Windows only";

pub(crate) fn wifi_history(params: &Value) -> anyhow::Result<Value> {
    reject_unknown_arguments(params, &["max_events", "within_seconds"])?;
    #[cfg(windows)]
    {
        let max = bounded_u64(params, "max_events", 200, 1, 2_000)? as usize;
        let within = history_window(params)?;
        let events = radiochron::events::recent(max, within)?;
        let verdict = radiochron::events::detect(&events);
        return Ok(json!({
            "available": true,
            "events": events,
            "verdict": verdict
        }));
    }
    #[cfg(not(windows))]
    {
        let _ = params;
        Ok(json!({
            "available": false,
            "reason": HISTORY_UNAVAILABLE
        }))
    }
}

pub(crate) fn diagnose_incident(params: &Value) -> anyhow::Result<Value> {
    reject_unknown_arguments(
        params,
        &[
            "dns_name",
            "tcp_target",
            "internet_target",
            "captive_portal_url",
            "captive_portal_expected_status",
            "tls_target",
            "quality_target",
            "quality_attempts",
            "timeout_ms",
            "refresh_scan",
            "include_history",
            "include_analysis",
            "max_events",
            "within_seconds",
        ],
    )?;

    let mut evidence = IncidentEvidence::new(now_epoch_seconds());
    evidence.wifi_status = wifi_status_section();
    evidence.wifi_analysis = if optional_bool(params, "include_analysis", true)? {
        match collect_analysis(params) {
            Ok(analysis) => EvidenceSection::available(analysis),
            Err(error) => EvidenceSection::failed("collector", error.to_string()),
        }
    } else {
        EvidenceSection::NotRequested
    };
    evidence.connectivity = connectivity_section(params)?;
    evidence.history = if optional_bool(params, "include_history", true)? {
        history_section(params)?
    } else {
        EvidenceSection::NotRequested
    };

    let report = classify(&evidence);
    Ok(json!({
        "report": report,
        "evidence": {
            "wifi_status": evidence.wifi_status,
            "wifi_analysis": evidence.wifi_analysis,
            "connectivity": evidence.connectivity,
            "history": evidence.history
        }
    }))
}

fn wifi_status_section() -> EvidenceSection<WifiStatusEvidence> {
    match radiochron::wlan::wifi_status() {
        Ok(statuses) => EvidenceSection::available(WifiStatusEvidence {
            interfaces: statuses
                .iter()
                .map(|status| WifiInterfaceSnapshot {
                    guid: status.interface.guid.clone(),
                    description: status.interface.description.clone(),
                    state: status.interface.state.clone(),
                    connected: status.connection.is_some(),
                    ssid: status
                        .connection
                        .as_ref()
                        .and_then(|connection| connection.ssid.clone()),
                    bssid: status
                        .connection
                        .as_ref()
                        .and_then(|connection| connection.bssid.clone()),
                    signal_quality: status
                        .connection
                        .as_ref()
                        .map(|connection| connection.signal_quality),
                    rssi_dbm_estimate: status
                        .connection
                        .as_ref()
                        .map(|connection| connection.rssi_dbm_estimate),
                })
                .collect(),
        }),
        Err(error) => EvidenceSection::failed("collector", error.to_string()),
    }
}

fn connectivity_section(
    params: &Value,
) -> anyhow::Result<EvidenceSection<ConnectivityEvidence>> {
    let has_target = [
        "dns_name",
        "tcp_target",
        "internet_target",
        "captive_portal_url",
        "tls_target",
        "quality_target",
    ]
    .iter()
    .any(|name| params.get(*name).and_then(Value::as_str).is_some());
    if !has_target {
        return Ok(EvidenceSection::NotRequested);
    }

    let config = ConnectivityConfig {
        dns_name: optional_trimmed(params, "dns_name", 253)?,
        tcp_target: optional_trimmed(params, "tcp_target", 512)?,
        internet_target: optional_trimmed(params, "internet_target", 512)?,
        captive_portal_url: optional_trimmed(params, "captive_portal_url", 2048)?,
        captive_portal_expected_status: bounded_u64(
            params,
            "captive_portal_expected_status",
            204,
            100,
            599,
        )? as u16,
        tls_target: optional_trimmed(params, "tls_target", 512)?,
        quality_target: optional_trimmed(params, "quality_target", 512)?,
        quality_attempts: bounded_u64(params, "quality_attempts", 4, 1, 20)? as u8,
        timeout: Duration::from_millis(bounded_u64(params, "timeout_ms", 3_000, 100, 30_000)?),
    };
    Ok(EvidenceSection::available(connectivity_evidence(
        &radiochron::connectivity::diagnose(&config),
    )))
}

fn connectivity_evidence(report: &ConnectivityReport) -> ConnectivityEvidence {
    let stages = [
        ("radio", &report.radio),
        ("authentication", &report.authentication),
        ("dhcp", &report.dhcp),
        ("gateway", &report.gateway),
        ("dns", &report.dns),
        ("tcp", &report.tcp),
        ("captive_portal", &report.captive_portal),
        ("tls", &report.tls),
        ("packet_quality", &report.packet_quality),
        ("internet", &report.internet),
    ];
    let mut failed_stages = Vec::new();
    let mut unknown_stages = Vec::new();
    for (name, stage) in stages {
        match stage.status {
            StageStatus::Fail => failed_stages.push((*name).to_string()),
            StageStatus::Unknown => unknown_stages.push((*name).to_string()),
            StageStatus::Pass | StageStatus::Skipped => {}
        }
    }
    ConnectivityEvidence {
        failed_stages,
        unknown_stages,
    }
}

fn collect_analysis(params: &Value) -> anyhow::Result<WifiAnalysisEvidence> {
    if optional_bool(params, "refresh_scan", false)? {
        let _ = radiochron::wlan::bss::scan_and_wait(Duration::from_secs(12))?;
    }
    let collection = radiochron::wlan::bss::bss_list_detailed()?;
    let statuses = radiochron::wlan::wifi_status()?;
    let connection = statuses
        .iter()
        .find_map(|status| status.connection.as_ref());
    let analysis = radiochron::wlan::analyze::analyze(&collection.entries, connection);
    Ok(WifiAnalysisEvidence {
        bss_count: analysis.bss_count,
        finding_ids: analysis
            .findings
            .iter()
            .map(|finding| finding.id.to_string())
            .collect(),
    })
}

fn history_section(params: &Value) -> anyhow::Result<EvidenceSection<HistoryEvidence>> {
    #[cfg(windows)]
    {
        let max = bounded_u64(params, "max_events", 200, 1, 2_000)? as usize;
        let within = history_window(params)?;
        match radiochron::events::recent(max, within) {
            Ok(events) => {
                let verdict = radiochron::events::detect(&events);
                Ok(EvidenceSection::available(HistoryEvidence {
                    events_considered: verdict.events_considered,
                    finding_ids: verdict
                        .findings
                        .iter()
                        .map(|finding| finding.id.to_string())
                        .collect(),
                }))
            }
            Err(error) => Ok(EvidenceSection::failed("collector", error.to_string())),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = params;
        Ok(EvidenceSection::unavailable(
            "native WLAN event history is currently available on Windows only",
        ))
    }
}

fn history_window(params: &Value) -> anyhow::Result<Option<u64>> {
    match params.get("within_seconds") {
        None => Ok(Some(3_600)),
        Some(value) if value.is_null() => Ok(None),
        Some(_) => Ok(Some(bounded_u64(
            params,
            "within_seconds",
            3_600,
            60,
            86_400,
        )?)),
    }
}

fn optional_trimmed(
    params: &Value,
    name: &str,
    max_len: usize,
) -> anyhow::Result<Option<String>> {
    match params.get(name) {
        None => Ok(None),
        Some(value) => {
            let text = value
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("{name} must be a string"))?
                .trim();
            if text.is_empty() || text.len() > max_len {
                anyhow::bail!("{name} must contain 1..={max_len} bytes");
            }
            Ok(Some(text.to_string()))
        }
    }
}

fn now_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_is_platform_honest() {
        let value = wifi_history(&json!({})).unwrap();
        #[cfg(windows)]
        assert_eq!(value["available"], true);
        #[cfg(not(windows))]
        {
            assert_eq!(value["available"], false);
            assert!(value["reason"].as_str().unwrap().contains("Windows"));
        }
    }
}
