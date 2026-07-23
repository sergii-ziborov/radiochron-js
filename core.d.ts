export interface RadioChronCoreClientOptions {
  executablePath?: string;
}

export interface RadioChronPing {
  engine: 'radiochron';
  core_version: string;
  transport: 'node_adapter';
  platform: string;
  arch: string;
}

export interface RadioChronInterface {
  guid: string;
  description: string;
  state: string;
}

export interface RadioChronConnection {
  profile_name: string | null;
  ssid: string | null;
  bssid: string | null;
  phy_type: string;
  signal_quality: number;
  rssi_dbm_estimate: number;
  rx_rate_kbps: number;
  tx_rate_kbps: number;
}

export interface RadioChronWifiStatus {
  interface: RadioChronInterface;
  connection: RadioChronConnection | null;
  connection_error?: string;
}

export interface RadioChronScanResult {
  interfaces_scanning: number;
}

export interface RadioChronInformationElements {
  byte_length: number;
  element_count: number;
  element_ids: number[];
  names: string[];
  extension_ids: number[];
  vendor_ouis: string[];
  has_rsn: boolean;
  has_wpa: boolean;
  has_bss_load: boolean;
  has_country: boolean;
  has_ht: boolean;
  has_vht: boolean;
  has_he: boolean;
  has_eht: boolean;
  has_wps: boolean;
  country_code: string | null;
  channel_width_mhz: number | null;
  bss_load: {
    station_count: number;
    channel_utilization_percent: number;
    available_admission_capacity: number;
  } | null;
  rsn: {
    group_cipher: string | null;
    pairwise_ciphers: string[];
    akm_suites: string[];
    pmf_capable: boolean;
    pmf_required: boolean;
  } | null;
  [name: string]: unknown;
}

export interface RadioChronNetwork {
  interface_guid: string;
  ssid: string | null;
  bssid: string;
  bss_type: string;
  phy_type: string;
  rssi_dbm: number;
  link_quality: number;
  center_frequency_khz: number;
  band: string;
  channel: number | null;
  beacon_period_tu: number;
  in_reg_domain: boolean;
  capability_information: number;
  timestamp: number;
  host_timestamp: number;
  rates_mbps: number[];
  ie_data_complete: boolean;
  information_elements: RadioChronInformationElements;
}

export interface RadioChronInterfaceError {
  interface_guid: string;
  error_code: number;
  message?: string;
}

export interface RadioChronRefreshResult {
  interfaces_requested: number;
  interfaces_completed: number;
  interfaces_timed_out: number;
  [name: string]: unknown;
}

export interface RadioChronNetworksResult {
  count: number;
  cache_age_seconds: number | null;
  refresh: RadioChronRefreshResult | null;
  networks: RadioChronNetwork[];
  interface_errors: RadioChronInterfaceError[];
}

export interface RadioChronFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info' | string;
  title: string;
  detail: unknown;
  caveat: string;
}

export interface RadioChronBandSummary {
  band: string;
  bss_count: number;
  distinct_ssids: number;
  distinct_channels: number;
  strongest_dbm: number | null;
}

export interface RadioChronAnalysisResult {
  cache_age_seconds: number | null;
  refresh: RadioChronRefreshResult | null;
  interface_errors: RadioChronInterfaceError[];
  analysis: {
    bss_count: number;
    connected: Record<string, unknown> | null;
    bands: RadioChronBandSummary[];
    findings: RadioChronFinding[];
  };
}

export interface RadioChronSample {
  elapsed_ms: number;
  interface_guid: string | null;
  connected: boolean;
  collector_error?: string;
  bssid: string | null;
  signal_quality: number | null;
  rssi_dbm_estimate: number | null;
  rx_rate_kbps: number | null;
  tx_rate_kbps: number | null;
}

export interface RadioChronSampleResult {
  duration_s: number;
  interval_ms: number;
  sample_count: number;
  interface_guid: string | null;
  ssid: string | null;
  disconnected_samples: number;
  failed_samples: number;
  bssids_seen: string[];
  roam_count: number;
  rssi_min_dbm: number | null;
  rssi_max_dbm: number | null;
  rssi_mean_dbm: number | null;
  rssi_swing_db: number | null;
  rx_rate_min_kbps: number | null;
  rx_rate_max_kbps: number | null;
  samples: RadioChronSample[];
}

export type RadioChronStageStatus = 'pass' | 'fail' | 'unknown' | 'skipped';

export interface RadioChronDiagnosticStage {
  status: RadioChronStageStatus;
  evidence: string;
  latency_ms?: number;
}

export interface RadioChronConnectivityReport {
  observed_at_epoch_seconds: number;
  interface_id?: string;
  radio: RadioChronDiagnosticStage;
  authentication: RadioChronDiagnosticStage;
  dhcp: RadioChronDiagnosticStage;
  ip_configuration?: {
    assignment: 'dhcp' | 'static' | 'link_local' | 'unknown';
    addresses: string[];
    gateway?: string;
    evidence: string;
  };
  gateway: RadioChronDiagnosticStage;
  dns: RadioChronDiagnosticStage;
  tcp: RadioChronDiagnosticStage;
  captive_portal: RadioChronDiagnosticStage;
  tls: RadioChronDiagnosticStage;
  packet_quality: RadioChronDiagnosticStage;
  packet_quality_measurement?: {
    attempts: number;
    successes: number;
    loss_percent: number;
    mean_latency_ms?: number;
    jitter_ms?: number;
  };
  internet: RadioChronDiagnosticStage;
}

export type RadioChronBleAddressType =
  | 'public'
  | 'random_static'
  | 'resolvable_private'
  | 'non_resolvable_private'
  | 'unknown';

export interface RadioChronBleManufacturerData {
  company_id: number;
  data: number[];
}

export interface RadioChronBleServiceData {
  uuid: string;
  data: number[];
}

export interface RadioChronBleAdvertisement {
  address: string;
  address_type: RadioChronBleAddressType;
  local_name?: string | null;
  rssi_dbm: number;
  tx_power_dbm?: number | null;
  connectable?: boolean | null;
  service_uuids?: string[];
  manufacturer_data?: RadioChronBleManufacturerData[];
  service_data?: RadioChronBleServiceData[];
  protocol_identity?: string | null;
}

export interface RadioChronBleSensorContext {
  sensor_id: string;
  zone?: string | null;
  movement_session?: string | null;
  sensor_is_moving: boolean;
}

export interface RadioChronBleObservation {
  monotonic_ms: number;
  unix_epoch_ms?: number | null;
  context: RadioChronBleSensorContext;
  advertisement: RadioChronBleAdvertisement;
}

export type RadioChronBleIdentityConfidence =
  | 'protocol'
  | 'caller_provided'
  | 'static_address'
  | 'ephemeral_address';

export interface RadioChronBleIdentity {
  key: string;
  confidence: RadioChronBleIdentityConfidence;
  protocol: string | null;
}

export interface RadioChronBleHistory {
  identity: RadioChronBleIdentity;
  first_seen_ms: number;
  last_seen_ms: number;
  observation_count: number;
  sensor_count: number;
  movement_session_count: number;
  rssi_min_dbm: number;
  rssi_max_dbm: number;
  rssi_mean_dbm: number;
  last_payload_hash: string;
}

export type RadioChronBleRiskKind =
  | 'persistent_unknown'
  | 'co_travel'
  | 'disappeared'
  | 'possible_clone'
  | 'beacon_flood';

export interface RadioChronBleFinding {
  kind: RadioChronBleRiskKind;
  severity: 'info' | 'warning' | 'high';
  identity_key: string | null;
  observed_at_ms: number;
  summary: string;
  evidence: string[];
  limitations: string[];
}

export interface RadioChronBleTrackerPolicy {
  persistent_unknown_ms?: number;
  co_travel_min_sessions?: number;
  disappearance_ms?: number;
  clone_window_ms?: number;
  flood_window_ms?: number;
  flood_unique_identities?: number;
  allowlisted_identity_keys?: string[];
  expected_identity_keys?: string[];
}

export interface RadioChronBleIdentityResult {
  identity: RadioChronBleIdentity;
  payload_hash: string;
}

export interface RadioChronBleObservationResult extends RadioChronBleIdentityResult {
  history: RadioChronBleHistory;
  findings: RadioChronBleFinding[];
}

export interface RadioChronBleClient {
  identify(advertisement: RadioChronBleAdvertisement, timeoutMs?: number): Promise<RadioChronBleIdentityResult>;
  resetTracker(policy?: RadioChronBleTrackerPolicy, timeoutMs?: number): Promise<{ reset: true }>;
  observe(observation: RadioChronBleObservation, timeoutMs?: number): Promise<RadioChronBleObservationResult>;
  histories(timeoutMs?: number): Promise<RadioChronBleHistory[]>;
  evaluate(nowMs: number, timeoutMs?: number): Promise<RadioChronBleFinding[]>;
}

export interface RadioChronChronicleStatus {
  running: boolean;
  path: string;
  started_at_epoch_seconds: number | null;
  stopped_at_epoch_seconds: number | null;
  entries_written_this_run: number;
  last_error: string | null;
}

export type RadioChronClockQuality = 'unknown' | 'synchronized' | 'unsynchronized';

export interface RadioChronClockMetadata {
  quality: RadioChronClockQuality;
  source: string;
  monotonic_ms: number;
}

export interface RadioChronChronicleEntry {
  schema_version: number;
  device_id?: string;
  boot_id: string;
  sequence: number;
  event_id: string;
  clock: RadioChronClockMetadata;
  epoch_seconds: number;
  time: string;
  interface_guid?: string;
  kind: string;
  [name: string]: unknown;
}

export interface RadioChronChronicleRecent {
  path: string;
  count: number;
  invalid_lines: number;
  entries: RadioChronChronicleEntry[];
}

export interface RadioChronNetworkOptions {
  refreshScan?: boolean;
  timeoutMs?: number;
}

export interface RadioChronSampleOptions {
  interfaceGuid?: string;
  durationSeconds?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export interface RadioChronConnectivityOptions {
  dnsName?: string;
  tcpTarget?: string;
  internetTarget?: string;
  captivePortalUrl?: string;
  captivePortalExpectedStatus?: number;
  tlsTarget?: string;
  qualityTarget?: string;
  qualityAttempts?: number;
  probeTimeoutMs?: number;
  timeoutMs?: number;
}

export interface RadioChronChronicleStartOptions {
  intervalSeconds?: number;
  signalThresholdDb?: number;
  timeoutMs?: number;
}

export interface RadioChronChronicleRecentOptions {
  maxEntries?: number;
  timeoutMs?: number;
}

export interface RadioChronChronicleClient {
  start(options?: RadioChronChronicleStartOptions): Promise<RadioChronChronicleStatus>;
  stop(): Promise<RadioChronChronicleStatus>;
  status(): Promise<RadioChronChronicleStatus>;
  recent(options?: RadioChronChronicleRecentOptions): Promise<RadioChronChronicleRecent>;
}

export class RadioChronCoreClient {
  constructor(options?: RadioChronCoreClientOptions);
  readonly chronicle: RadioChronChronicleClient;
  readonly ble: RadioChronBleClient;
  call<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  ping(): Promise<RadioChronPing>;
  status(): Promise<RadioChronWifiStatus[]>;
  wifiStatus(): Promise<RadioChronWifiStatus[]>;
  scan(timeoutMs?: number): Promise<RadioChronScanResult>;
  wifiScan(timeoutMs?: number): Promise<RadioChronScanResult>;
  networks(options?: RadioChronNetworkOptions): Promise<RadioChronNetworksResult>;
  wifiNetworks(options?: RadioChronNetworkOptions): Promise<RadioChronNetworksResult>;
  analyze(options?: RadioChronNetworkOptions): Promise<RadioChronAnalysisResult>;
  sample(options?: RadioChronSampleOptions): Promise<RadioChronSampleResult>;
  diagnoseConnectivity(options?: RadioChronConnectivityOptions): Promise<RadioChronConnectivityReport>;
  chronicleStart(options?: RadioChronChronicleStartOptions): Promise<RadioChronChronicleStatus>;
  chronicleStop(): Promise<RadioChronChronicleStatus>;
  chronicleStatus(): Promise<RadioChronChronicleStatus>;
  chronicleRecent(options?: RadioChronChronicleRecentOptions): Promise<RadioChronChronicleRecent>;
  dispose(): void;
}

export const chronicle: RadioChronChronicleClient;
export const ble: RadioChronBleClient;
export function ping(): Promise<RadioChronPing>;
export function status(): Promise<RadioChronWifiStatus[]>;
export function scan(timeoutMs?: number): Promise<RadioChronScanResult>;
export function networks(options?: RadioChronNetworkOptions): Promise<RadioChronNetworksResult>;
export function analyze(options?: RadioChronNetworkOptions): Promise<RadioChronAnalysisResult>;
export function sample(options?: RadioChronSampleOptions): Promise<RadioChronSampleResult>;
export function diagnoseConnectivity(options?: RadioChronConnectivityOptions): Promise<RadioChronConnectivityReport>;
export function getRadioChronCoreClient(): RadioChronCoreClient;
export function disposeRadioChronCoreClient(): void;
export function resolveRadioChronCoreBridgePath(options?: RadioChronCoreClientOptions): string;
export function radiochronCoreManifestPath(): string;
export function targetFor(platform?: string, arch?: string): { key: string; executable: string };
