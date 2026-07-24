use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct SystemBluetoothDevice {
    id: String,
    name: Option<String>,
    address: Option<String>,
    transport: &'static str,
    paired: Option<bool>,
    connected: Option<bool>,
    category: Option<&'static str>,
    class_of_device: Option<u32>,
    appearance: Option<u16>,
    source: &'static str,
}

#[cfg(not(windows))]
pub async fn enumerate() -> (Vec<SystemBluetoothDevice>, Vec<String>) {
    (Vec::new(), Vec::new())
}

#[cfg(windows)]
pub async fn enumerate() -> (Vec<SystemBluetoothDevice>, Vec<String>) {
    windows_inventory::enumerate().await
}

pub fn stable_identity_for_address(
    devices: &[SystemBluetoothDevice],
    address: &str,
) -> Option<String> {
    let normalized = normalized_address(address);
    devices
        .iter()
        .find(|device| {
            (device.paired == Some(true) || device.connected == Some(true))
                && device
                    .address
                    .as_deref()
                    .is_some_and(|candidate| normalized_address(candidate) == normalized)
        })
        .map(|device| device.id.clone())
}

fn normalized_address(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(windows)]
mod windows_inventory {
    use std::collections::{HashMap, HashSet};

    use windows::core::HSTRING;
    use windows::Devices::Bluetooth::{
        BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice,
    };
    use windows::Devices::Enumeration::DeviceInformation;

    use super::SystemBluetoothDevice;
    use crate::system_bluetooth_classification::{
        classic_category, format_address, le_category, privacy_id,
    };

    pub async fn enumerate() -> (Vec<SystemBluetoothDevice>, Vec<String>) {
        let mut devices = HashMap::new();
        let mut errors = Vec::new();
        collect_classic(&mut devices, &mut errors).await;
        collect_le(&mut devices, &mut errors).await;
        let mut result: Vec<_> = devices.into_values().collect();
        result.sort_by(|left, right| {
            right
                .connected
                .cmp(&left.connected)
                .then_with(|| right.paired.cmp(&left.paired))
                .then_with(|| left.name.cmp(&right.name))
        });
        (result, errors)
    }

    async fn collect_classic(
        devices: &mut HashMap<String, SystemBluetoothDevice>,
        errors: &mut Vec<String>,
    ) {
        let selectors = [
            (BluetoothDevice::GetDeviceSelector(), None),
            (
                BluetoothDevice::GetDeviceSelectorFromPairingState(true),
                Some(true),
            ),
            (
                BluetoothDevice::GetDeviceSelectorFromConnectionStatus(
                    BluetoothConnectionStatus::Connected,
                ),
                None,
            ),
        ];
        for (selector, paired_hint) in selectors {
            match selector {
                Ok(selector) => {
                    collect_selector(&selector, "classic", paired_hint, devices, errors).await;
                }
                Err(error) => errors.push(format!("system classic selector: {error}")),
            }
        }
    }

    async fn collect_le(
        devices: &mut HashMap<String, SystemBluetoothDevice>,
        errors: &mut Vec<String>,
    ) {
        let selectors = [
            (BluetoothLEDevice::GetDeviceSelector(), None),
            (
                BluetoothLEDevice::GetDeviceSelectorFromPairingState(true),
                Some(true),
            ),
            (
                BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(
                    BluetoothConnectionStatus::Connected,
                ),
                None,
            ),
        ];
        for (selector, paired_hint) in selectors {
            match selector {
                Ok(selector) => {
                    collect_selector(&selector, "ble", paired_hint, devices, errors).await;
                }
                Err(error) => errors.push(format!("system BLE selector: {error}")),
            }
        }
    }

    async fn collect_selector(
        selector: &HSTRING,
        transport: &'static str,
        paired_hint: Option<bool>,
        devices: &mut HashMap<String, SystemBluetoothDevice>,
        errors: &mut Vec<String>,
    ) {
        let collection = match DeviceInformation::FindAllAsyncAqsFilter(selector) {
            Ok(operation) => match operation.await {
                Ok(collection) => collection,
                Err(error) => {
                    errors.push(format!("system {transport} inventory: {error}"));
                    return;
                }
            },
            Err(error) => {
                errors.push(format!("system {transport} inventory: {error}"));
                return;
            }
        };
        let mut seen = HashSet::new();
        for info in collection {
            let raw_id = match info.Id() {
                Ok(id) => id.to_string(),
                Err(error) => {
                    errors.push(format!("system {transport} device id: {error}"));
                    continue;
                }
            };
            if !seen.insert(raw_id.clone()) {
                continue;
            }
            let device = if transport == "classic" {
                classic_device(&info, &raw_id, paired_hint).await
            } else {
                le_device(&info, &raw_id, paired_hint).await
            };
            merge(devices, device);
        }
    }

    async fn classic_device(
        info: &DeviceInformation,
        raw_id: &str,
        paired_hint: Option<bool>,
    ) -> SystemBluetoothDevice {
        let native = BluetoothDevice::FromIdAsync(&HSTRING::from(raw_id))
            .ok()
            .map(|operation| async move { operation.await.ok() });
        let native = match native {
            Some(operation) => operation.await,
            None => None,
        };
        let class_of_device = native
            .as_ref()
            .and_then(|device| device.ClassOfDevice().ok())
            .and_then(|class| class.RawValue().ok());
        SystemBluetoothDevice {
            id: privacy_id(raw_id),
            name: preferred_name(
                native.as_ref().and_then(|device| device.Name().ok()),
                info.Name().ok(),
            ),
            address: native
                .as_ref()
                .and_then(|device| device.BluetoothAddress().ok())
                .map(format_address),
            transport: "classic",
            paired: merge_state(pairing_state(info), paired_hint),
            connected: native
                .as_ref()
                .and_then(|device| device.ConnectionStatus().ok().map(is_connected)),
            category: class_of_device.and_then(classic_category),
            class_of_device,
            appearance: None,
            source: "windows-device-enumeration",
        }
    }

    async fn le_device(
        info: &DeviceInformation,
        raw_id: &str,
        paired_hint: Option<bool>,
    ) -> SystemBluetoothDevice {
        let native = BluetoothLEDevice::FromIdAsync(&HSTRING::from(raw_id))
            .ok()
            .map(|operation| async move { operation.await.ok() });
        let native = match native {
            Some(operation) => operation.await,
            None => None,
        };
        let appearance = native
            .as_ref()
            .and_then(|device| device.Appearance().ok())
            .and_then(|appearance| appearance.RawValue().ok());
        SystemBluetoothDevice {
            id: privacy_id(raw_id),
            name: preferred_name(
                native.as_ref().and_then(|device| device.Name().ok()),
                info.Name().ok(),
            ),
            address: native
                .as_ref()
                .and_then(|device| device.BluetoothAddress().ok())
                .map(format_address),
            transport: "ble",
            paired: merge_state(pairing_state(info), paired_hint),
            connected: native
                .as_ref()
                .and_then(|device| device.ConnectionStatus().ok().map(is_connected)),
            category: appearance.and_then(le_category),
            class_of_device: None,
            appearance,
            source: "windows-device-enumeration",
        }
    }

    fn merge(
        devices: &mut HashMap<String, SystemBluetoothDevice>,
        incoming: SystemBluetoothDevice,
    ) {
        let key = incoming
            .address
            .clone()
            .unwrap_or_else(|| incoming.id.clone());
        let Some(current) = devices.get_mut(&key) else {
            devices.insert(key, incoming);
            return;
        };
        if current.transport != incoming.transport {
            current.transport = "dual";
        }
        if current.name.is_none() {
            current.name = incoming.name;
        }
        if current.category.is_none() {
            current.category = incoming.category;
        }
        current.paired = merge_state(current.paired, incoming.paired);
        current.connected = merge_state(current.connected, incoming.connected);
        current.class_of_device = current.class_of_device.or(incoming.class_of_device);
        current.appearance = current.appearance.or(incoming.appearance);
    }

    fn merge_state(current: Option<bool>, incoming: Option<bool>) -> Option<bool> {
        match (current, incoming) {
            (Some(left), Some(right)) => Some(left || right),
            (Some(value), None) | (None, Some(value)) => Some(value),
            (None, None) => None,
        }
    }

    fn pairing_state(info: &DeviceInformation) -> Option<bool> {
        info.Pairing()
            .ok()
            .and_then(|pairing| pairing.IsPaired().ok())
    }

    fn preferred_name(primary: Option<HSTRING>, fallback: Option<HSTRING>) -> Option<String> {
        primary
            .and_then(non_empty)
            .or_else(|| fallback.and_then(non_empty))
    }

    fn non_empty(value: HSTRING) -> Option<String> {
        let value = value.to_string();
        (!value.trim().is_empty()).then_some(value)
    }

    fn is_connected(status: BluetoothConnectionStatus) -> bool {
        status == BluetoothConnectionStatus::Connected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_only_known_system_identity_for_an_exact_address() {
        let devices = vec![
            device("paired", "AA:BB:CC:DD:EE:FF", Some(true), Some(false)),
            device("unpaired", "11:22:33:44:55:66", Some(false), Some(false)),
        ];

        assert_eq!(
            stable_identity_for_address(&devices, "aa-bb-cc-dd-ee-ff"),
            Some("paired".to_string())
        );
        assert_eq!(
            stable_identity_for_address(&devices, "11:22:33:44:55:66"),
            None
        );
    }

    fn device(
        id: &str,
        address: &str,
        paired: Option<bool>,
        connected: Option<bool>,
    ) -> SystemBluetoothDevice {
        SystemBluetoothDevice {
            id: id.to_string(),
            name: None,
            address: Some(address.to_string()),
            transport: "ble",
            paired,
            connected,
            category: None,
            class_of_device: None,
            appearance: None,
            source: "test",
        }
    }
}
