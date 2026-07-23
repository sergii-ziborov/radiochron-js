use super::*;

#[test]
fn ping_identifies_node_adapter_transport() {
    let result = handle(&Bridge::new(), "ping", &json!({})).unwrap();
    assert_eq!(result["engine"], "radiochron");
    assert_eq!(result["transport"], "node_adapter");
    assert_eq!(result["core_version"], "0.4.0");
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
