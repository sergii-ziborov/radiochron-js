use std::sync::Mutex;

use radiochron::ble::{Advertisement, Observation, Tracker, TrackerPolicy};
use serde_json::{json, Value};

pub struct BleService {
    tracker: Mutex<Tracker>,
}

impl BleService {
    pub fn new() -> Self {
        Self {
            tracker: Mutex::new(Tracker::new(TrackerPolicy::default())),
        }
    }

    pub fn identify(&self, params: &Value) -> anyhow::Result<Value> {
        let advertisement: Advertisement = required(params, "advertisement")?;
        Ok(json!({
            "identity": radiochron::ble::identify(&advertisement),
            "payload_hash": radiochron::ble::payload_hash(&advertisement)
        }))
    }

    pub fn reset(&self, params: &Value) -> anyhow::Result<Value> {
        let policy = match params.get("policy") {
            Some(value) => serde_json::from_value(value.clone())?,
            None => TrackerPolicy::default(),
        };
        *self.lock()? = Tracker::new(policy);
        Ok(json!({ "reset": true }))
    }

    pub fn observe(&self, params: &Value) -> anyhow::Result<Value> {
        let observation: Observation = required(params, "observation")?;
        Ok(serde_json::to_value(self.lock()?.observe(observation))?)
    }

    pub fn histories(&self) -> anyhow::Result<Value> {
        let tracker = self.lock()?;
        Ok(serde_json::to_value(
            tracker.histories().cloned().collect::<Vec<_>>(),
        )?)
    }

    pub fn evaluate(&self, params: &Value) -> anyhow::Result<Value> {
        let now_ms = params
            .get("now_ms")
            .and_then(Value::as_u64)
            .ok_or_else(|| anyhow::anyhow!("now_ms must be a non-negative integer"))?;
        Ok(serde_json::to_value(self.lock()?.evaluate(now_ms))?)
    }

    fn lock(&self) -> anyhow::Result<std::sync::MutexGuard<'_, Tracker>> {
        self.tracker
            .lock()
            .map_err(|_| anyhow::anyhow!("BLE tracker lock poisoned"))
    }
}

fn required<T: serde::de::DeserializeOwned>(params: &Value, name: &str) -> anyhow::Result<T> {
    let value = params
        .get(name)
        .ok_or_else(|| anyhow::anyhow!("{name} is required"))?;
    Ok(serde_json::from_value(value.clone())?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identify_returns_an_opaque_key_and_payload_hash() {
        let service = BleService::new();
        let value = service
            .identify(&json!({
                "advertisement": {
                    "address": "aa",
                    "address_type": "random_static",
                    "local_name": "tag",
                    "rssi_dbm": -50,
                    "tx_power_dbm": null,
                    "connectable": false,
                    "service_uuids": [],
                    "manufacturer_data": [],
                    "service_data": [],
                    "protocol_identity": null
                }
            }))
            .unwrap();

        assert!(value["identity"]["key"]
            .as_str()
            .unwrap()
            .starts_with("ble-id-v1:"));
        assert!(value["payload_hash"]
            .as_str()
            .unwrap()
            .starts_with("ble-payload-v1:"));
    }
}
