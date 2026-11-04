/**
 * Model tools (Canvas v3): translation read + immediate atomic write.
 *
 * The model is never handed an internal claim id. `whiteboard_read_selection`
 * returns the B5 translation plus lossless JSON; `whiteboard_replace_selection`
 * applies the patch right away as one atomic, undoable change (human edits win
 * field by field). The Host checks the per-(canvas x session) AI switch before
 * either tool touches the canvas.
 *
 * See docs/adr/0003-canvas-agent-bridge.md §5.2 and docs/DECISIONS.md B7.
 */

import { LIMITS } from './constants.js';
import { translateSelection } from './model.js';

const ANTI_DRIFT = 'Only use the data returned by this tool to judge the canvas. Do not open a browser, take screenshots, read application source or logs, or use other tools to verify the canvas; when the data is ambiguous, make the smallest reasonable change and state the assumption in the reply.';

const AI_DISABLED = 'ai_disabled: AI is turned off for this canvas in this session; turn it back on in the whiteboard panel.';

function callerSession(exec) {
  const agent = exec && exec.agent;
  return agent && agent.id ? String(agent.id) : '';
}

/** The (canvas x session) switch is enforced here, so a disabled canvas is
 *  never read or written even if the UI entry point failed to hide. */
async function assertAiEnabled(engine, sessionId, canvasId) {
  if (sessionId === '') return;
  const pref = await engine.getSessionPref(sessionId);
  const byCanvas = pref && pref.aiByCanvas;
  if (byCanvas && typeof byCanvas === 'object' && byCanvas[canvasId] === false) {
    throw new Error(AI_DISABLED);
  }
}

function requireCanvasId(args) {
  const canvasId = args && typeof args.canvasId === 'string' ? args.canvasId.trim() : '';
  if (canvasId === '') {
    throw new Error('canvas_not_found: canvasId is required; pass the id of the canvas to read or change.');
  }
  return canvasId;
}

function conflictReason(reason) {
  if (reason === 'stale_base') return '该字段在你读取后被修改，已保留画板上的最新值';
  if (reason === 'missing') return '对象已被删除';
  if (reason === 'too_many_elements') return '画板对象已达上限';
  return String(reason || '冲突');
}

function ignoredReason(reason) {
  if (reason === 'missing') return '对象已被删除';
  if (reason === 'no_usable_field') return '没有可修改的字段';
  return String(reason || '已忽略');
}

export function createReadTool(engine) {
  return {
    name: 'whiteboard_read_selection',
    description: 'Read objects from a whiteboard canvas: a compact Chinese translation plus JSON (id, type, x/y/w/h, color, rev, and text for text objects). '
      + 'Use it before whiteboard_replace_selection, and when the user refers to "the selection" or "my whiteboard". '
      + 'Omit `ids` to read the whole canvas (at most ' + LIMITS.claimIds + ' non-pen objects); pass `ids` to read a narrower selection, where ids that no longer exist are returned under `invalid` instead of failing. '
      + 'Pass `expectRev` to fail with `stale_revision` when the canvas moved. '
      + 'Colors are reported as hex with their palette id (e.g. `#2f6fed（accent）`); either form is accepted back. '
      + 'Fails with `canvas_not_found`, `stale_revision`, `too_large`, and `ai_disabled`. '
      + ANTI_DRIFT,
    parameters: {
      type: 'object',
      properties: {
        canvasId: {
          type: 'string',
          description: 'Canvas id; the whiteboard panel shows the active board and a read result always includes its canvasId.',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Object ids to read. Omit to read every non-pen object on the canvas (at most ' + LIMITS.claimIds + ').',
        },
        expectRev: {
          type: 'number',
          description: 'Optional canvas revision the caller believes is current; a different rev fails with `stale_revision` instead of returning outdated data.',
        },
      },
      required: ['canvasId'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          canvasId: { type: 'string' },
          canvasName: { type: 'string' },
          rev: { type: 'number' },
          objects: { type: 'array' },
          invalid: { type: 'array' },
        },
        required: ['canvasId', 'canvasName', 'rev', 'objects', 'invalid'],
      },
      render: function (_args, value) {
        return [{
          type: 'text',
          text: translateSelection(value) + '\n\n' + JSON.stringify({
            canvasId: value.canvasId,
            rev: value.rev,
            objects: value.objects,
            invalid: value.invalid,
          }),
        }];
      },
    },
    async execute(args, exec) {
      const sessionId = callerSession(exec);
      const canvasId = requireCanvasId(args);
      await assertAiEnabled(engine, sessionId, canvasId);
      const result = await engine.readModelSelection({
        canvasId: canvasId,
        ids: args && args.ids,
        expectRev: args && args.expectRev,
        sessionId: sessionId,
      });
      if (!result.ok) throw new Error(result.error);
      return {
        canvasId: result.canvasId,
        canvasName: result.canvasName,
        rev: result.rev,
        objects: result.objects,
        invalid: result.invalid,
      };
    },
  };
}

export function createReplaceTool(engine) {
  return {
    name: 'whiteboard_replace_selection',
    description: 'Apply field edits and/or new objects to a whiteboard canvas. The whole call is ONE atomic change: the canvas rev bumps once and the user can undo it as a single step. '
      + '`expectRev` must be the rev just read; when the canvas moved the call fails with `stale_revision` and must be retried after whiteboard_read_selection. '
      + 'Patches may set x/y/w/h/color and text (text objects only); ids and types cannot change, pen strokes are read-only, and deletion is the user\'s action. '
      + 'Colors accept palette ids (ink/accent/red/green/amber) or hex codes such as `#2f6fed`. '
      + 'A deleted object comes back under `ignored`; a field the user changed after the read comes back under `conflicts` and keeps the user value. '
      + 'Fails with `canvas_not_found`, `stale_revision`, `invalid_proposal`, `too_large`, and `ai_disabled`. '
      + 'After it succeeds, report the result to the user in one sentence. '
      + ANTI_DRIFT,
    parameters: {
      type: 'object',
      properties: {
        canvasId: {
          type: 'string',
          description: 'Canvas id; the whiteboard panel shows the active board and a read result always includes its canvasId.',
        },
        expectRev: {
          type: 'number',
          description: 'The canvas rev the caller read; the write is rejected with `stale_revision` when the canvas has moved since.',
        },
        patches: {
          type: 'array',
          description: 'Field-level edits to existing objects: [{ id, set: { x?, y?, w?, h?, color?, text? } }]. Omitted fields stay unchanged. `set.color` accepts a palette id or a hex code.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              set: { type: 'object', additionalProperties: true },
            },
            required: ['id', 'set'],
            additionalProperties: false,
          },
        },
        inserts: {
          type: 'array',
          description: 'New objects to add: [{ type, x, y, w?, h?, text?, color? }]. A text insert needs non-empty `text`; `w`/`h` default to 160x100 (arrow 120x0, text 88x22). `color` accepts a palette id or a hex code.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['rect', 'ellipse', 'arrow', 'text'] },
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
              text: { type: 'string' },
              color: { type: 'string' },
            },
            required: ['type', 'x', 'y'],
            additionalProperties: false,
          },
        },
      },
      required: ['canvasId', 'expectRev'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          rev: { type: 'number' },
          applied: { type: 'array' },
          inserted: { type: 'array' },
          ignored: { type: 'array' },
          conflicts: { type: 'array' },
          notes: { type: 'array' },
        },
        required: ['ok', 'rev', 'applied', 'inserted', 'ignored', 'conflicts', 'notes'],
      },
      render: function (_args, value) {
        const summary = [];
        if (value.applied.length > 0) summary.push('已应用 ' + value.applied.length + ' 个对象的修改');
        if (value.inserted.length > 0) summary.push('新增 ' + value.inserted.length + ' 个对象');
        if (summary.length === 0) summary.push('没有应用任何修改');
        const parts = [summary.join('，') + '，画板 rev ' + value.rev + '。'];
        if (value.conflicts.length > 0) {
          parts.push('冲突（已保留画板上的最新值）：\n- ' + value.conflicts.map(function (item) {
            const where = String(item.id) + (item.field ? '.' + item.field : '');
            return where + '：' + conflictReason(item.reason);
          }).join('\n- '));
        }
        if (value.ignored.length > 0) {
          parts.push('已忽略：\n- ' + value.ignored.map(function (item) {
            return String(item.id) + '：' + ignoredReason(item.reason);
          }).join('\n- '));
        }
        return [{ type: 'text', text: parts.join('\n\n') }];
      },
    },
    async execute(args, exec) {
      const sessionId = callerSession(exec);
      const canvasId = requireCanvasId(args);
      await assertAiEnabled(engine, sessionId, canvasId);
      const result = await engine.applyModelPatch({
        canvasId: canvasId,
        expectRev: args && args.expectRev,
        sessionId: sessionId,
        patches: args && args.patches,
        inserts: args && args.inserts,
      });
      if (!result.ok) throw new Error(result.error);
      return {
        ok: true,
        rev: result.rev,
        applied: result.applied,
        inserted: result.inserted,
        ignored: result.ignored,
        conflicts: result.conflicts,
        notes: result.notes,
      };
    },
  };
}
