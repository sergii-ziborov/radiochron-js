'use strict';

// `radiochron/wifi` — the Wi-Fi half of the API as plain named exports.
//
// A subpath rather than a separate package: one native bridge ships with this
// package, and splitting the surface across packages would ship that binary
// twice and version the two halves independently. The import site does the
// separating instead, which is also what makes `scan` unambiguous — this one
// and `radiochron/ble`'s are different calls with the same good name.
//
// Every export is the identical function object `radiochron` exports, so the
// shared client and its single spawned bridge are shared here too.

const core = require('./core');

module.exports = {
  analyze: core.analyze,
  diagnose: core.diagnose,
  diagnoseConnectivity: core.diagnoseConnectivity,
  history: core.history,
  networks: core.networks,
  sample: core.sample,
  scan: core.scan,
  status: core.status,
  streamStatus: core.streamStatus
};
