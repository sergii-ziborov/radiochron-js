'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildIncidentBundle, redactBundle, INCIDENT_BUNDLE_SCHEMA } = require('../incident-bundle');
const { createIncidentBundle, readIncidentBundle } = require('../core');

test('bundle schema is stable and support privacy redacts identities', () => {
  const diagnosis = {
    report: {
      schema_version: 1,
      observed_at_epoch_seconds: 1,
      assessment: 'incident',
      causes: [],
      evidence: [],
      gaps: [],
      actions: [],
      limitations: []
    },
    evidence: {
      wifi_status: {
        status: 'available',
        data: {
          interfaces: [{ guid: 'g', description: 'w', state: 'up', connected: true, ssid: 'corp', bssid: 'aa:bb' }]
        }
      }
    }
  };
  const bundle = redactBundle(
    buildIncidentBundle({
      diagnosis,
      privacy: 'support',
      bundleId: 'b1',
      createdAt: '2026-09-06T00:00:00Z',
      producer: { surface: 'test', surface_version: '0', core_version: '0.5.0' },
      platform: { os: 'win32', arch: 'x64' }
    }),
    'support'
  );
  assert.equal(bundle.schema, INCIDENT_BUNDLE_SCHEMA);
  assert.match(bundle.wifi_status.data.interfaces[0].ssid, /^ssid-/);
  assert.match(bundle.wifi_status.data.interfaces[0].bssid, /^bssid-/);
});

test('createIncidentBundle accepts a prebuilt report without calling the bridge', async () => {
  const report = {
    schema_version: 1,
    observed_at_epoch_seconds: 1,
    assessment: 'unknown',
    causes: [],
    evidence: [],
    gaps: [],
    actions: [],
    limitations: ['fixture']
  };
  const bundle = await createIncidentBundle({
    report,
    evidence: {},
    privacy: 'minimal',
    bundleId: 'fixture-1',
    createdAt: '2026-09-06T00:00:00Z'
  });
  const restored = await readIncidentBundle(JSON.stringify(bundle));
  assert.equal(restored.bundle_id, 'fixture-1');
  assert.equal(restored.incident.assessment, 'unknown');
});
