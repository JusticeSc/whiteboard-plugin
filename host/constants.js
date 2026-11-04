/**
 * Shared vocabulary of the whiteboard Host: limits, enums and the storage unit
 * descriptor. See docs/adr/0002-canvas-authority.md.
 */

export const HOST_SCHEMA_VERSION = 2;
export const CANVAS_SCHEMA_VERSION = 2;

/** Storage unit descriptor (raw `json` backend, per-record layout).
 *  Unit and table names must match /^[a-z][a-z0-9_]*$/. */
export const UNIT = Object.freeze({
  name: 'whiteboard',
  version: 1,
  tables: Object.freeze(['canvas', 'session_pref']),
  layout: 'per-record',
  hasGlobal: true,
});

export const LIMITS = Object.freeze({
  /** Whole-canvas element cap. */
  elements: 2000,
  /** One claim may freeze at most this many objects. */
  claimIds: 40,
  /** One model call may stage at most this many replace/insert entries. */
  patchOps: 200,
  /** Inserts per single replace call. */
  insertsPerCall: 50,
  /** Text content cap (characters). */
  textLength: 2000,
  /** HTTP request body cap (bytes). */
  bodyBytes: 1024 * 1024,
  /** Durable canvas document cap (bytes); export + compact when exceeded. */
  docBytes: 2 * 1024 * 1024,
  /** Changes kept in a single client payload (tail). */
  changesTail: 100,
  /** Idempotency cache size per route family. */
  idempotency: 200,
});

export const CLAIM_TTL_MS = 10 * 60 * 1000;
/** Extra grace after a turn ends before a claim is force-released. */
export const CLAIM_GRACE_MS = 60 * 1000;

/** Element types the model may create. */
export const AI_INSERT_TYPES = new Set(['rect', 'ellipse', 'arrow', 'text']);
/** Element types the human editor may create (pen is human-only). */
export const HUMAN_INSERT_TYPES = new Set(['rect', 'ellipse', 'arrow', 'text', 'pen']);
export const ELEMENT_TYPES = new Set(['rect', 'ellipse', 'arrow', 'text', 'pen']);

export const COLOR_IDS = new Set(['ink', 'accent', 'red', 'green', 'amber']);

export const INSERT_DEFAULTS = Object.freeze({
  rect: { w: 160, h: 100 },
  ellipse: { w: 160, h: 100 },
  arrow: { w: 120, h: 0 },
  text: { w: 88, h: 22 },
  pen: { w: 0, h: 0 },
});

/** Fields a patch may touch, per element type. */
export const EDITABLE_FIELDS = Object.freeze({
  rect: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  ellipse: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  arrow: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  text: Object.freeze(['x', 'y', 'w', 'h', 'color', 'text']),
  pen: Object.freeze([]),
});

/** Every rev-bearing field of an element, per type (basis capture). */
export const REV_FIELDS = Object.freeze({
  rect: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  ellipse: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  arrow: Object.freeze(['x', 'y', 'w', 'h', 'color']),
  text: Object.freeze(['x', 'y', 'w', 'h', 'color', 'text']),
  pen: Object.freeze(['color', 'points']),
});

export const COORD_LIMIT = 1_000_000;

export const ROUTE_PREFIX = '/api/whiteboard/v2';

export const ERROR_CODES = Object.freeze({
  notReady: 'not_ready',
  canvasNotFound: 'canvas_not_found',
  invalidBody: 'invalid_body',
  invalidJson: 'invalid_json',
  tooLarge: 'too_large',
  methodNotAllowed: 'method_not_allowed',
  contentRequired: 'content_type_required',
  originNotAllowed: 'origin_not_allowed',
  claimNotFound: 'claim_not_found',
  claimForbidden: 'claim_forbidden',
  claimConflict: 'claim_conflict',
  claimExpired: 'claim_expired',
  unknownChange: 'unknown_change',
  unsupportedSchema: 'unsupported_schema',
});
