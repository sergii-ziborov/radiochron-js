import api from './core.js';

export const {
  RadioChronCoreClient,
  analyze,
  ble,
  chronicle,
  diagnoseConnectivity,
  disposeRadioChronCoreClient,
  getRadioChronCoreClient,
  networks,
  ping,
  radiochronCoreManifestPath,
  resolveRadioChronCoreBridgePath,
  sample,
  scan,
  status,
  streamBle,
  streamChronicle,
  streamStatus,
  targetFor
} = api;
