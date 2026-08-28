'use strict';

// `radiochron/chronicle` — the change journal as plain named exports.
//
// `status` here is the recorder's state, not an association state; that is the
// point of the subpath. Importing both is unambiguous at the import site:
//
//   import { status as wifiStatus } from 'radiochron/wifi';
//   import { status as recorderStatus } from 'radiochron/chronicle';

const core = require('./core');

module.exports = {
  recent: core.chronicle.recent,
  start: core.chronicle.start,
  status: core.chronicle.status,
  stop: core.chronicle.stop,
  stream: core.chronicle.stream
};
