use std::time::{Duration, Instant};

use btleplug::api::{
    AddressType as NativeAddressType, Central, Manager as _, Peripheral, PeripheralProperties,
    ScanFilter,
};
use btleplug::platform::Manager;
use radiochron::ble::{AddressType, Advertisement, ManufacturerData, ServiceData};
use serde_json::{json, Value};

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
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()?;
    runtime.block_on(scan_async(Duration::from_millis(duration_ms)))
}

async fn scan_async(duration: Duration) -> anyhow::Result<Value> {
    let started = Instant::now();
    let manager = Manager::new().await?;
    let adapters = manager.adapters().await?;
    for adapter in &adapters {
        adapter.start_scan(ScanFilter::default()).await?;
    }
    tokio::time::sleep(duration).await;
    let (system_devices, system_errors) = system_bluetooth::enumerate().await;

    let mut advertisements = Vec::new();
    let mut errors = system_errors;
    for (index, adapter) in adapters.iter().enumerate() {
        match adapter.peripherals().await {
            Ok(peripherals) => {
                for peripheral in peripherals {
                    match peripheral.properties().await {
                        Ok(Some(properties)) => {
                            advertisements.push(map(&peripheral, properties, &system_devices))
                        }
                        Ok(None) => {}
                        Err(error) => errors.push(format!("adapter {index}: {error}")),
                    }
                }
            }
            Err(error) => errors.push(format!("adapter {index}: {error}")),
        }
        if let Err(error) = adapter.stop_scan().await {
            errors.push(format!("adapter {index} stop: {error}"));
        }
    }

    Ok(json!({
        "adapter_count": adapters.len(),
        "elapsed_ms": started.elapsed().as_millis() as u64,
        "discovery_mode": discovery_mode(),
        "advertisements": advertisements,
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

fn map(
    peripheral: &btleplug::platform::Peripheral,
    properties: PeripheralProperties,
    system_devices: &[system_bluetooth::SystemBluetoothDevice],
) -> Advertisement {
    let address = format!("{:x}", properties.address);
    let address_type = match properties.address_type {
        Some(NativeAddressType::Public) => AddressType::Public,
        Some(NativeAddressType::Random) => classify_random(properties.address.as_ref()),
        None => AddressType::Unknown,
    };
    Advertisement {
        protocol_identity: platform_identity(
            &peripheral.id().to_string(),
            &address,
            system_devices,
        ),
        address,
        address_type,
        local_name: properties.local_name.or(properties.advertisement_name),
        rssi_dbm: properties.rssi.unwrap_or(i16::MIN),
        tx_power_dbm: properties.tx_power_level,
        connectable: None,
        service_uuids: properties
            .services
            .into_iter()
            .map(|uuid| uuid.to_string())
            .collect(),
        manufacturer_data: properties
            .manufacturer_data
            .into_iter()
            .map(|(company_id, data)| ManufacturerData { company_id, data })
            .collect(),
        service_data: properties
            .service_data
            .into_iter()
            .map(|(uuid, data)| ServiceData {
                uuid: uuid.to_string(),
                data,
            })
            .collect(),
    }
}

#[cfg(target_os = "macos")]
fn platform_identity(
    peripheral_id: &str,
    _address: &str,
    _system_devices: &[system_bluetooth::SystemBluetoothDevice],
) -> Option<String> {
    Some(format!("corebluetooth:{peripheral_id}"))
}

#[cfg(not(target_os = "macos"))]
fn platform_identity(
    _peripheral_id: &str,
    address: &str,
    system_devices: &[system_bluetooth::SystemBluetoothDevice],
) -> Option<String> {
    system_bluetooth::stable_identity_for_address(system_devices, address)
        .map(|identity| format!("system:{identity}"))
}

fn classify_random(address: &[u8]) -> AddressType {
    match address.first().map(|byte| byte >> 6) {
        Some(0b11) => AddressType::RandomStatic,
        Some(0b01) => AddressType::ResolvablePrivate,
        Some(0b00) => AddressType::NonResolvablePrivate,
        _ => AddressType::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_address_bits_are_not_reported_as_a_stable_mac() {
        assert_eq!(
            classify_random(&[0b0100_0000]),
            AddressType::ResolvablePrivate
        );
        assert_eq!(
            classify_random(&[0b0000_0000]),
            AddressType::NonResolvablePrivate
        );
        assert_eq!(classify_random(&[0b1100_0000]), AddressType::RandomStatic);
    }

    #[test]
    fn reports_the_effective_platform_discovery_mode() {
        let expected = if cfg!(windows) {
            "active"
        } else {
            "platform_managed"
        };
        assert_eq!(discovery_mode(), expected);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn uses_the_core_bluetooth_peer_uuid_as_protocol_identity() {
        assert_eq!(
            platform_identity("A14A-PEER", "", &[]),
            Some("corebluetooth:A14A-PEER".to_string())
        );
    }
}
