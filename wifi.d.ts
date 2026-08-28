// Types for `radiochron/wifi`.
//
// Re-exported from `./core` rather than restated, so a signature has exactly
// one definition and a subpath cannot drift from the root export it forwards.

export {
  analyze,
  diagnoseConnectivity,
  networks,
  sample,
  scan,
  status,
  streamStatus
} from './core';

export type {
  RadioChronAnalysisResult,
  RadioChronBandSummary,
  RadioChronConnection,
  RadioChronConnectivityOptions,
  RadioChronConnectivityReport,
  RadioChronDiagnosticStage,
  RadioChronFinding,
  RadioChronInformationElements,
  RadioChronInterface,
  RadioChronInterfaceError,
  RadioChronNetwork,
  RadioChronNetworkOptions,
  RadioChronNetworksResult,
  RadioChronRefreshResult,
  RadioChronSample,
  RadioChronSampleOptions,
  RadioChronSampleResult,
  RadioChronScanResult,
  RadioChronStageStatus,
  RadioChronStreamOptions,
  RadioChronWifiStatus
} from './core';
