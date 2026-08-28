'use strict';

// `radiochron/ble` — the Bluetooth LE half of the API as plain named exports.
//
// The root export reaches these through the `ble` namespace object. Here they
// are flat, so `scan` and `stream` can be imported under their own names
// without colliding with the Wi-Fi calls of the same name.
//
// `stream` is `ble.stream` — repeated scans — while `histories` and `evaluate`
// read the tracker the scans feed.

const core = require('./core');

module.exports = {
  evaluate: core.ble.evaluate,
  histories: core.ble.histories,
  identify: core.ble.identify,
  observe: core.ble.observe,
  resetTracker: core.ble.resetTracker,
  scan: core.ble.scan,
  stream: core.ble.stream
};
