'use strict';

const INCIDENT_BUNDLE_SCHEMA = 'radiochron.incident_bundle.v1';

function buildIncidentBundle({
  diagnosis,
  privacy = 'support',
  bundleId,
  createdAt,
  producer,
  platform
}) {
  return {
    schema: INCIDENT_BUNDLE_SCHEMA,
    bundle_id: bundleId,
    created_at: createdAt,
    producer,
    platform,
    privacy: {
      level: privacy,
      redacted_fields: [],
      disabled_collectors: [],
      retention_policy: null
    },
    incident: diagnosis.report,
    wifi_status: diagnosis.evidence?.wifi_status || null,
    environment: diagnosis.evidence?.wifi_analysis || null,
    connectivity: diagnosis.evidence?.connectivity || null,
    history: diagnosis.evidence?.history || null,
    chronicle: null,
    flight_window: null,
    adapter: null,
    ble: null
  };
}

function redactBundle(bundle, privacy) {
  const copy = structuredClone(bundle);
  copy.privacy.level = privacy;
  if (privacy === 'full') {
    return copy;
  }

  const redacted = [];
  const scrubIdentity = (section) => {
    if (!section || section.status !== 'available' || !section.data?.interfaces) return;
    for (const iface of section.data.interfaces) {
      if (iface.ssid) {
        iface.ssid = privacy === 'minimal' ? null : pseudonym(iface.ssid, 'ssid');
        redacted.push('wifi_status.ssid');
      }
      if (iface.bssid) {
        iface.bssid = privacy === 'minimal' ? null : pseudonym(iface.bssid, 'bssid');
        redacted.push('wifi_status.bssid');
      }
    }
  };

  scrubIdentity(copy.wifi_status);
  if (privacy === 'minimal') {
    copy.history = null;
    copy.chronicle = null;
    copy.ble = null;
    redacted.push('history', 'chronicle', 'ble');
  }
  copy.privacy.redacted_fields = [...new Set(redacted)];
  return copy;
}

function pseudonym(value, kind) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `${kind}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

module.exports = {
  INCIDENT_BUNDLE_SCHEMA,
  buildIncidentBundle,
  redactBundle
};
