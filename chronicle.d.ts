// Types for `radiochron/chronicle`.
//
// Typed by indexing `RadioChronChronicleClient` so the interface stays the
// single definition. Note that `status` here is the recorder's state, not an
// association state — the subpath is what keeps the two names apart.

import type { RadioChronChronicleClient } from './core';

export declare const recent: RadioChronChronicleClient['recent'];
export declare const start: RadioChronChronicleClient['start'];
export declare const status: RadioChronChronicleClient['status'];
export declare const stop: RadioChronChronicleClient['stop'];
export declare const stream: RadioChronChronicleClient['stream'];

export type {
  RadioChronChronicleClient,
  RadioChronChronicleEntry,
  RadioChronChronicleRecent,
  RadioChronChronicleRecentOptions,
  RadioChronChronicleStartOptions,
  RadioChronChronicleStatus,
  RadioChronChronicleStreamOptions,
  RadioChronClockMetadata,
  RadioChronClockQuality
} from './core';
