// Types for `radiochron/ble`.
//
// The root export groups these under the `ble` namespace object, so there are
// no flat declarations to re-export. Each one is typed by indexing
// `RadioChronBleClient` instead of restating its signature, which keeps the
// interface the single definition.

import type { RadioChronBleClient } from './core';

export declare const evaluate: RadioChronBleClient['evaluate'];
export declare const histories: RadioChronBleClient['histories'];
export declare const identify: RadioChronBleClient['identify'];
export declare const observe: RadioChronBleClient['observe'];
export declare const resetTracker: RadioChronBleClient['resetTracker'];
export declare const scan: RadioChronBleClient['scan'];
export declare const stream: RadioChronBleClient['stream'];

export type {
  RadioChronBleAddressType,
  RadioChronBleAdvertisement,
  RadioChronBleClient,
  RadioChronBleDiscoveryMode,
  RadioChronBleFinding,
  RadioChronBleHistory,
  RadioChronBleIdentity,
  RadioChronBleIdentityConfidence,
  RadioChronBleIdentityResult,
  RadioChronBleManufacturerData,
  RadioChronBleObservation,
  RadioChronBleObservationResult,
  RadioChronBleRiskKind,
  RadioChronBleScanOptions,
  RadioChronBleScanResult,
  RadioChronBleSensorContext,
  RadioChronBleServiceData,
  RadioChronBleStreamOptions,
  RadioChronBleTrackerPolicy,
  RadioChronBluetoothSystemDevice,
  RadioChronBluetoothTransport
} from './core';
