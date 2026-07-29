use std::time::{Duration, Instant};

use blazingly_json::{json, Value};

use crate::system_bluetooth;

pub fn scan(params: &Value) -> anyhow::Result<Value> {
    let duration_ms = params
        .get("duration_ms")
        .map(|value| {
            value
                .as_u64()
                .filter(|value| (100..=60_000).contains(value))
                .ok_or_else(|| anyhow::anyhow!("duration_ms must be between 100 and 60000"))
        })
        .transpose()?
        .unwrap_or(5_000);
    let started = Instant::now();
    let report = radiochron_native_ble::scan(Duration::from_millis(duration_ms))?;
    let (system_devices, system_errors) = system_bluetooth::enumerate();
    let mut advertisements = report.advertisements;
    attach_system_identities(&mut advertisements, &system_devices);
    let mut errors = report.errors;
    errors.extend(system_errors);

    Ok(json!({
        "adapter_count": report.adapters.len(),
        "adapters": report.adapters,
        "elapsed_ms": started.elapsed().as_millis() as u64,
        "discovery_mode": discovery_mode(),
        "advertisements": advertisements,
        "skipped_without_rssi": report.skipped_without_rssi,
        "system_devices": system_devices,
        "errors": errors
    }))
}

fn discovery_mode() -> &'static str {
    if cfg!(windows) {
        "active"
    } else {
        "platform_managed"
    }
}

#[cfg(not(target_os = "macos"))]
fn attach_system_identities(
    advertisements: &mut [radiochron::ble::Advertisement],
    system_devices: &[system_bluetooth::SystemBluetoothDevice],
) {
    for advertisement in advertisements {
        if advertisement.protocol_identity.is_none() {
            advertisement.protocol_identity = system_bluetooth::stable_identity_for_address(
                system_devices,
                &advertisement.address,
            )
            .map(|identity| format!("system:{identity}"));
        }
    }
}

#[cfg(target_os = "macos")]
fn attach_system_identities(
    _advertisements: &mut [radiochron::ble::Advertisement],
    _system_devices: &[system_bluetooth::SystemBluetoothDevice],
) {
}

#[cfg(test)]
mod tests {
    use super::discovery_mode;

    #[test]
    fn reports_the_effective_platform_discovery_mode() {
        let expected = if cfg!(windows) {
            "active"
        } else {
            "platform_managed"
        };
        assert_eq!(discovery_mode(), expected);
    }
}
