'use strict';

// Text rendering for the CLI.
//
// Only what a person reads at a glance gets a bespoke layout. Anything whose
// value is in its structure is printed as indented JSON, which is more honest
// than a table that silently drops the nested half of the answer.

const HIDDEN = '<hidden>';
const PRIVACY =
  '\nSSIDs and BSSIDs identify neighbouring networks; a BSSID resolves to a street\n' +
  'address through public geolocation databases. Treat this list as location data.';

function scalar(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  return String(value);
}

/** Columns padded to the widest cell, measured in code points. */
function table(headers, rows) {
  const width = (text) => [...text].length;
  const widths = headers.map((header, index) =>
    Math.max(width(header), ...rows.map((row) => width(row[index] ?? '')))
  );
  const line = (cells) =>
    cells
      .map((cell, index) => cell + ' '.repeat(Math.max(0, widths[index] - width(cell))))
      .join('  ')
      .trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

/**
 * The Node bridge answers `wifi_status` with a bare array while the MCP tool
 * wraps it as `{ interfaces }`. Accept both so the renderer keeps working if
 * either side changes its envelope.
 */
function status(result) {
  const interfaces = Array.isArray(result) ? result : result?.interfaces;
  if (!Array.isArray(interfaces) || interfaces.length === 0) return 'No WLAN interfaces reported.';
  return interfaces
    .map((entry) => {
      const lines = [scalar(entry.interface?.description), `  state: ${scalar(entry.interface?.state)}`];
      if (entry.connection_error) lines.push(`  error: ${entry.connection_error}`);
      const connection = entry.connection;
      if (!connection) {
        lines.push('  not associated');
        return lines.join('\n');
      }
      lines.push(
        `  ssid:    ${scalar(connection.ssid)}`,
        `  bssid:   ${scalar(connection.bssid)}`,
        `  phy:     ${scalar(connection.phy_type)}`,
        `  signal:  ${scalar(connection.signal_quality)}/100  (~${scalar(connection.rssi_dbm_estimate)} dBm)`,
        `  rates:   rx ${scalar(connection.rx_rate_kbps)} kbps / tx ${scalar(connection.tx_rate_kbps)} kbps`
      );
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * A coarse security label read straight off the IE flags.
 *
 * The bridge returns full `BssEntry` objects, which carry the raw elements
 * rather than the `BssSummary.security` classification. Rather than
 * reimplementing that classification here — where it would drift from the Rust
 * core that owns it — this reports only what the flags literally say, and
 * prefers a flat `security` field whenever one is present.
 */
function security(entry) {
  if (typeof entry.security === 'string') return entry.security;
  const elements = entry.information_elements;
  if (!elements) return '-';
  if (elements.has_rsn) return 'rsn';
  if (elements.has_wpa) return 'wpa';
  return 'open';
}

function networks(result) {
  const entries = result?.networks;
  if (!Array.isArray(entries)) return 'No networks in the response.';
  const rows = [...entries]
    .sort((left, right) => (right.rssi_dbm ?? -127) - (left.rssi_dbm ?? -127))
    .map((entry) => [
      entry.ssid ?? HIDDEN,
      scalar(entry.bssid),
      scalar(entry.band),
      scalar(entry.channel),
      scalar(entry.rssi_dbm),
      security(entry)
    ]);

  const age =
    typeof result.cache_age_seconds === 'number' ? `, scan cache ${result.cache_age_seconds}s old` : '';
  const errors = interfaceErrors(result);
  return [
    table(['SSID', 'BSSID', 'BAND', 'CH', 'RSSI', 'SECURITY'], rows),
    '',
    `${entries.length} BSS visible${age}.`,
    ...(errors ? [errors] : []),
    PRIVACY
  ].join('\n');
}

function analyze(result) {
  const analysis = result?.analysis;
  if (!analysis) return 'No analysis in the response.';
  const parts = [`${scalar(analysis.bss_count)} BSS analysed.`, ''];

  if (Array.isArray(analysis.bands) && analysis.bands.length > 0) {
    parts.push(
      table(
        ['BAND', 'BSS', 'SSIDS', 'CHANNELS', 'STRONGEST'],
        analysis.bands.map((band) => [
          scalar(band.band),
          scalar(band.bss_count),
          scalar(band.distinct_ssids),
          scalar(band.distinct_channels),
          scalar(band.strongest_dbm)
        ])
      ),
      ''
    );
  }

  const findings = analysis.findings ?? [];
  if (findings.length === 0) {
    parts.push('Findings: none. Nothing in the environment looks wrong.');
  } else {
    parts.push(`Findings (${findings.length}):`, '');
    for (const finding of findings) {
      parts.push(`  [${scalar(finding.severity)}] ${scalar(finding.title)}`);
      parts.push(`      ${finding.caveat ?? 'no caveat recorded'}`, '');
    }
  }
  const errors = interfaceErrors(result);
  if (errors) parts.push(errors);
  return parts.join('\n').trimEnd();
}

/** A scan that partly failed must say so rather than read as quiet air. */
function interfaceErrors(result) {
  const errors = result?.interface_errors;
  if (!Array.isArray(errors) || errors.length === 0) return '';
  const lines = errors.map((error) => `  ${JSON.stringify(error)}`);
  return [`\n${errors.length} interface(s) failed during collection:`, ...lines].join('\n');
}

const RENDERERS = { status, networks, analyze };

/** Render one command's result as text. */
function emit(command, result) {
  const renderer = RENDERERS[command];
  return renderer ? renderer(result) : JSON.stringify(result, null, 2);
}

module.exports = { emit, table, status, networks, analyze, security };
