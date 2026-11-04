/**
 * Whiteboard v3 — client half of the bundle.
 *
 * Two blocks plus a thin carrier (see docs/adr/0003-canvas-agent-bridge.md):
 *
 *   - Canvas: a hand-drawn board persisted as a durable Host document
 *     (`/api/whiteboard/v2`), rev-cursor sync, optimistic ops, server undo;
 *   - Bridge: the selection becomes a native reference chip above the normal
 *     composer; `codec.serialize` turns it into the model-facing translation
 *     at submit time; `uiConversation.userText` renders it compactly in the
 *     sent message; the model reads/writes through whiteboard_* tools.
 *
 * The carrier is a right-sidebar tab (keepMounted) so the board stays next to
 * the conversation; there is no conversation view, no second composer and no
 * custom conversation node.
 */
window.__ModuleLoader__.load({
  id: '@local/whiteboard',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'whiteboard';
    const ZOOM_MIN = 0.15;
    const ZOOM_MAX = 5;

    /* Canvas v2 wire contract — see docs/phase-bc-spec.md. */
    const API = '/api/whiteboard/v2';
    const SYNC_MS = 600;
    const FLUSH_MS = 350;
    const PROVENANCE_MS = 2000;
    const MAX_ELEMENTS = 2000;
    const MAX_TEXT = 2000;
    const TEXT_SIZE = 22;
    const STROKE_WIDTH = 2.2;

    /* ------------------------------------------------------------------ */
    /* Canvas v2 pure helpers (no DOM, no React, node-testable)            */
    /* ------------------------------------------------------------------ */

    function isNum(value) {
      return typeof value === 'number' && isFinite(value);
    }

    function clampNum(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    /* Stable per-element jitter seed derived from the id (never persisted). */
    function hashSeed(id) {
      let hash = 2166136261;
      const text = String(id || '');
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    /* Server element -> client element. The canonical fields stay identical;
       the client only adds the render-only `seed`. */
    function clientElement(server) {
      if (!server || typeof server !== 'object') return null;
      const element = {
        id: String(server.id),
        type: server.type,
        x: isNum(server.x) ? server.x : 0,
        y: isNum(server.y) ? server.y : 0,
        w: isNum(server.w) ? server.w : 0,
        h: isNum(server.h) ? server.h : 0,
        color: typeof server.color === 'string' ? server.color : 'ink',
        rev: isNum(server.rev) ? server.rev : 0,
        fieldRevs: server.fieldRevs && typeof server.fieldRevs === 'object' ? Object.assign({}, server.fieldRevs) : {},
        origin: server.origin === 'ai' ? 'ai' : 'user',
        turnId: server.turnId === undefined ? null : server.turnId,
        sessionId: server.sessionId === undefined ? null : server.sessionId,
        parentSessionId: server.parentSessionId === undefined ? null : server.parentSessionId,
        updatedAt: isNum(server.updatedAt) ? server.updatedAt : 0,
        seed: hashSeed(server.id),
      };
      if (server.type === 'text') element.text = typeof server.text === 'string' ? server.text : '';
      if (server.type === 'pen' && Array.isArray(server.points)) {
        element.points = server.points.map(function (point) { return [point[0], point[1]]; });
      }
      return element;
    }

    /* Client element -> the field set the Host stores for that type. */
    function elementFields(element) {
      if (element.type === 'pen') return { color: element.color, points: element.points };
      const fields = { x: element.x, y: element.y, w: element.w, h: element.h, color: element.color };
      if (element.type === 'text') fields.text = element.text;
      return fields;
    }

    function insertOp(element) {
      const op = { kind: 'insert', id: element.id, type: element.type };
      if (element.type === 'pen') {
        const points = element.points || [[0, 0]];
        op.x = points[0][0];
        op.y = points[0][1];
        op.color = element.color;
        op.points = points;
        return op;
      }
      op.x = element.x;
      op.y = element.y;
      op.w = element.w;
      op.h = element.h;
      op.color = element.color;
      if (element.type === 'text') op.text = element.text;
      return op;
    }

    function sameValue(a, b) {
      if (a === b) return true;
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) if (!sameValue(a[i], b[i])) return false;
        return true;
      }
      return false;
    }

    /* The single write path: diff the optimistic local state against the last
       server-confirmed fields and emit the minimal op batch. */
    function diffOps(base, elements) {
      const ops = [];
      const seen = new Set();
      for (let i = 0; i < elements.length; i += 1) {
        const element = elements[i];
        seen.add(element.id);
        const previous = base.get(element.id);
        const fields = elementFields(element);
        if (!previous) {
          ops.push(insertOp(element));
          continue;
        }
        const changed = {};
        const keys = Object.keys(fields);
        for (let k = 0; k < keys.length; k += 1) {
          const key = keys[k];
          if (!sameValue(previous[key], fields[key])) changed[key] = fields[key];
        }
        if (Object.keys(changed).length > 0) ops.push({ kind: 'replace', id: element.id, fields: changed });
      }
      base.forEach(function (_fields, id) {
        if (!seen.has(id)) ops.push({ kind: 'delete', id: id });
      });
      return ops;
    }

    function snapshotOf(elements) {
      const map = new Map();
      for (let i = 0; i < elements.length; i += 1) map.set(elements[i].id, elementFields(elements[i]));
      return map;
    }

    function makeRequestId(prefix) {
      return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    /* Apply one server change (from /sync, /op or /undo) to the local array.
       Idempotent enough for re-application: replace values converge. */
    function applyChange(elements, change) {
      if (!change || !Array.isArray(change.ops)) return elements;
      const map = new Map();
      for (let i = 0; i < elements.length; i += 1) map.set(elements[i].id, elements[i]);
      for (let i = 0; i < change.ops.length; i += 1) {
        const op = change.ops[i];
        if (op.kind === 'insert') {
          const element = clientElement(op.element);
          if (element) map.set(element.id, element);
          continue;
        }
        if (op.kind === 'delete') {
          map.delete(op.id);
          continue;
        }
        if (op.kind !== 'replace') continue;
        const element = map.get(op.id);
        if (!element) continue;
        const fieldRevs = Object.assign({}, element.fieldRevs);
        const fields = op.fields || {};
        const keys = Object.keys(fields);
        for (let k = 0; k < keys.length; k += 1) {
          const key = keys[k];
          const info = fields[key];
          const value = info && typeof info === 'object' && Object.prototype.hasOwnProperty.call(info, 'to') ? info.to : info;
          element[key] = value;
          if (info && typeof info === 'object' && isNum(info.revAfter)) fieldRevs[key] = info.revAfter;
        }
        element.fieldRevs = fieldRevs;
        element.rev = (element.rev || 0) + 1;
        if (change.author && change.author.kind === 'ai') {
          element.origin = 'ai';
          element.turnId = change.author.turnId === undefined ? null : change.author.turnId;
          element.sessionId = change.author.sessionId === undefined ? null : change.author.sessionId;
          element.parentSessionId = change.author.parentSessionId === undefined ? null : change.author.parentSessionId;
        }
        map.set(op.id, element);
      }
      return Array.from(map.values());
    }

    /* Ops that re-apply an already-created change (redo path). The change ops
       are in the server's from/to shape, so re-issuing them needs the `to`
       values of a replace and the full element of an insert. */
    function redoOpsOf(change) {
      const ops = [];
      if (!change || !Array.isArray(change.ops)) return ops;
      for (let i = 0; i < change.ops.length; i += 1) {
        const op = change.ops[i];
        if (op.kind === 'insert') {
          const element = clientElement(op.element);
          if (element) ops.push(insertOp(element));
          continue;
        }
        if (op.kind === 'delete') { ops.push({ kind: 'delete', id: op.id }); continue; }
        if (op.kind !== 'replace') continue;
        const fields = {};
        const source = op.fields || {};
        const keys = Object.keys(source);
        for (let k = 0; k < keys.length; k += 1) {
          const info = source[keys[k]];
          fields[keys[k]] = info && typeof info === 'object' && Object.prototype.hasOwnProperty.call(info, 'to') ? info.to : info;
        }
        if (Object.keys(fields).length > 0) ops.push({ kind: 'replace', id: op.id, fields: fields });
      }
      return ops;
    }

    /* ------------------------------------------------------------------ */
    /* HTTP client                                                        */
    /* ------------------------------------------------------------------ */

    async function apiGet(path) {
      const response = await fetch(API + path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      const payload = await response.json().catch(function () { return { ok: false, error: 'invalid_json' }; });
      if (!response.ok || payload.ok !== true) {
        const error = new Error(payload && payload.error ? payload.error : 'http_' + response.status);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    }

    async function apiPost(path, body) {
      const response = await fetch(API + path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const payload = await response.json().catch(function () { return { ok: false, error: 'invalid_json' }; });
      if (!response.ok || payload.ok !== true) {
        const error = new Error(payload && payload.error ? payload.error : 'http_' + response.status);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    }

    const PALETTE = [
      { id: 'ink', token: '--dsw-alias-label-primary', fallback: '#1f2329' },
      /* The theme's rand-primary is the near-black wordmark ink (#0f1115),
         not a hue: using it made the 品牌色 swatch look identical to 墨色.
         state-business-primary is the DeepSeek blue actually used for active UI. */
      { id: 'accent', token: '--dsw-alias-state-business-primary', fallback: '#2f6fed' },
      { id: 'red', token: '--dsw-alias-state-error-primary', fallback: '#d9343a' },
      { id: 'green', token: '--dsw-alias-state-success-primary', fallback: '#2f9e44' },
      { id: 'amber', token: '--dsw-alias-state-warn-primary', fallback: '#d98b0f' },
    ];
    const COLOR_IDS = PALETTE.map((item) => item.id);

    /* ------------------------------------------------------------------ */
    /* Bridge: selection -> reference chip -> serialized translation       */
    /* ------------------------------------------------------------------ */

    const REF_SOURCE = 'whiteboard';
    const REF_RULE_ID = 'whiteboard-ref';
    const REF_HEADER = '【画板选区引用】';
    const REF_FULL_LIMIT = 20;
    const REF_TEXT_LIMIT = 120;

    /* The selection is owned by the canvas tab but read by the composer dock:
       a tiny external store per session is the only shared state between the
       two slots. `liveCanvases` mirrors the latest elements so codec.serialize
       can read current fields at send time (selection ids stay frozen). */
    const bridgeStores = new Map();
    const liveCanvases = new Map();

    function bridgeStoreFor(sessionId) {
      const key = String(sessionId || '');
      let store = bridgeStores.get(key);
      if (store) return store;
      let state = {
        sessionId: key,
        ready: false,
        canvasId: '',
        canvasName: '画板',
        rev: 0,
        ids: [],
        objects: [],
        label: '',
        aiEnabled: true,
        inserted: false,
        snapshot: false,
        attachSnapshot: null,
      };
      const listeners = new Set();
      store = {
        get: function () { return state; },
        set: function (patch) {
          const next = Object.assign({}, state, patch);
          let changed = false;
          const keys = Object.keys(next);
          for (let i = 0; i < keys.length; i += 1) {
            if (next[keys[i]] !== state[keys[i]]) { changed = true; break; }
          }
          if (!changed) return;
          state = next;
          listeners.forEach(function (listener) {
            try { listener(); } catch (error) { /* keep other subscribers */ }
          });
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () { listeners.delete(listener); };
        },
      };
      bridgeStores.set(key, store);
      return store;
    }

    function paletteHex(id) {
      const item = PALETTE.find(function (candidate) { return candidate.id === id; }) || PALETTE[0];
      return item.fallback;
    }

    function bridgeText(value) {
      const text = String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
      return text.length > REF_TEXT_LIMIT ? text.slice(0, REF_TEXT_LIMIT) + '…' : text;
    }

    function bridgeObject(element) {
      if (!element) return null;
      const object = {
        id: element.id,
        type: element.type,
        x: isNum(element.x) ? element.x : 0,
        y: isNum(element.y) ? element.y : 0,
        w: isNum(element.w) ? element.w : 0,
        h: isNum(element.h) ? element.h : 0,
        color: typeof element.color === 'string' ? element.color : 'ink',
      };
      if (element.type === 'text') object.text = typeof element.text === 'string' ? element.text : '';
      return object;
    }

    function bridgeLine(object) {
      if (!object) return null;
      const hex = paletteHex(object.color);
      if (object.type === 'rect' || object.type === 'ellipse') {
        return '- ' + object.id + ' · ' + (object.type === 'rect' ? '矩形' : '椭圆')
          + ' · 位置(' + object.x + ',' + object.y + ') · ' + object.w + '×' + object.h + ' · 填充 ' + hex;
      }
      if (object.type === 'arrow') {
        return '- ' + object.id + ' · 箭头 · (' + object.x + ',' + object.y + ') → ('
          + (object.x + object.w) + ',' + (object.y + object.h) + ') · 描边 ' + hex + ' · 线宽 2.2';
      }
      if (object.type === 'text') {
        return '- ' + object.id + ' · 文本 · 位置(' + object.x + ',' + object.y + ') · 字号 22 · 颜色 ' + hex
          + ' · 内容「' + bridgeText(object.text) + '」';
      }
      return '- ' + object.id + ' · ' + object.type;
    }

    function bridgeLabel(ref) {
      const count = ref && Array.isArray(ref.ids) ? ref.ids.length : 0;
      return '画板选区 · ' + count + ' 个对象';
    }

    /* The text that ends up in the prompt: full translation for a small
       selection, a short marker that tells the model to call
       whiteboard_read_selection for a large one. */
    function bridgeTranslate(ref) {
      const ids = ref && Array.isArray(ref.ids) ? ref.ids.slice() : [];
      const name = (ref && ref.name) || '画板';
      const rev = (ref && ref.rev) || 0;
      /* canvasId rides on the header line so the model can call
         whiteboard_read_selection / whiteboard_replace_selection directly;
         the userText rule still matches the whole block. */
      const canvasId = (ref && ref.canvasId) || '';
      const header = REF_HEADER + name + ' · ' + ids.length + ' 个对象 · rev ' + rev
        + (canvasId ? ' · canvasId ' + canvasId : '');
      const live = liveCanvases.get(ref && ref.canvasId);
      const byId = new Map();
      const objects = (ref && Array.isArray(ref.objects) ? ref.objects : []).concat(live && live.objects ? live.objects : []);
      for (let i = 0; i < objects.length; i += 1) {
        if (!byId.has(objects[i].id)) byId.set(objects[i].id, objects[i]);
      }
      for (let i = 0; i < ids.length; i += 1) {
        if (live && live.elements && live.elements[ids[i]]) byId.set(ids[i], live.elements[ids[i]]);
      }
      if (ids.length > REF_FULL_LIMIT) {
        const counts = { rect: 0, ellipse: 0, arrow: 0, text: 0 };
        let known = 0;
        ids.forEach(function (id) {
          const object = byId.get(id);
          if (!object) return;
          known += 1;
          if (counts[object.type] !== undefined) counts[object.type] += 1;
        });
        const parts = [];
        if (counts.rect > 0) parts.push('矩形 ' + counts.rect);
        if (counts.ellipse > 0) parts.push('椭圆 ' + counts.ellipse);
        if (counts.arrow > 0) parts.push('箭头 ' + counts.arrow);
        if (counts.text > 0) parts.push('文本 ' + counts.text);
        if (known < ids.length) parts.push('未知 ' + (ids.length - known));
        return [
          header,
          '- 对象较多（' + ids.length + ' 个）· 类型统计：' + (parts.length > 0 ? parts.join('、') : '未知'),
          '- id 列表：' + ids.join(', '),
          '- 请调用 whiteboard_read_selection 读取这些对象的字段后再修改。',
        ].join('\n');
      }
      const lines = [header];
      for (let i = 0; i < ids.length; i += 1) {
        const object = byId.get(ids[i]);
        lines.push(object ? bridgeLine(object) : '- ' + ids[i] + ' · 已删除（invalid）');
      }
      return lines.join('\n');
    }

    function bridgeObjectsFor(elements, ids) {
      const byId = new Map();
      for (let i = 0; i < elements.length; i += 1) byId.set(elements[i].id, elements[i]);
      const objects = [];
      for (let i = 0; i < ids.length; i += 1) {
        const element = byId.get(ids[i]);
        if (!element) continue;
        const object = bridgeObject(element);
        if (object) objects.push(object);
      }
      return objects;
    }


    const TOOL_ORDER = ['select', 'hand', 'pen', 'rect', 'ellipse', 'arrow', 'text', 'eraser'];
    const TOOL_KEYS = [
      ['V', 'select'], ['H', 'hand'], ['P', 'pen'], ['R', 'rect'],
      ['O', 'ellipse'], ['A', 'arrow'], ['T', 'text'], ['E', 'eraser'],
    ];
    const SHORTCUTS = { v: 'select', h: 'hand', p: 'pen', r: 'rect', o: 'ellipse', a: 'arrow', t: 'text', e: 'eraser' };

    const DICT_ZH = {
      panel: '画板',
      'panel.desc': '手绘草图，选中后可把引用交给 AI',
      title: '画板',
      'tool.select': '选择', 'tool.hand': '抓手', 'tool.pen': '画笔', 'tool.rect': '矩形',
      'tool.ellipse': '椭圆', 'tool.arrow': '箭头', 'tool.text': '文字', 'tool.eraser': '橡皮',
      'group.tools': '工具', 'group.colors': '颜色',
      'color.ink': '墨色', 'color.accent': '品牌色', 'color.red': '红色', 'color.green': '绿色', 'color.amber': '琥珀色',
      'action.undo': '撤销', 'action.redo': '重做', 'action.clear': '清空画板',
      'action.export': '导出 PNG', 'action.fit': '重置视图',
      'action.zoomIn': '放大', 'action.zoomOut': '缩小',
      'toast.undo': '撤销',
            'provenance.ai': 'AI 修改',
      'ai.on': 'AI 已启用',
      'ai.off': 'AI 已关闭',
      'ai.onShort': 'AI',
      'ai.offShort': 'AI 关',
      'ai.onHint': 'AI 已启用：选中对象后可在输入框上方插入引用',
      'ai.offHint': 'AI 已关闭：本画板在本会话内不接受 AI 修改（点击开启）',
      'ref.addHint': '把画板选区作为引用加入输入框',
      'ref.addAria': '把画板选区作为引用加入输入框',
      'ref.inserted': '已插入引用',
      'ref.insertedHint': '引用已插入输入框，可直接删除',
      'ref.fallback': '已插入短标记（chip 降级）',
      'ref.failed': '引用插入失败',
      'ref.noComposer': '输入框还没准备好',
      'snapshot.aria': '附带选区快照',
      'snapshot.onHint': '附带选区快照：插入引用时会把选区图片一并加入输入框',
      'snapshot.offHint': '附带选区快照（默认关）：开启后插入引用时附带一张选区图片',
      'snapshot.added': '已附带快照',
      'snapshot.failed': '快照添加失败（引用已插入）',      'canvas.label': '画板画布',
      'hint.title': '在这里随手画点什么',
      'hint.body': '草图、流程图、批注都可以。内容保存在服务端画板里，同一对话随时可见，可导出 JSON / PNG。',
      'editor.placeholder': '输入文字，回车确认',
      'ai.applied.n': 'AI 修改了 {n} 处',
      'board.new': '新建画板',
      'board.rename': '重命名',
      'board.delete': '删除',
      'board.renamePrompt': '重命名画板',
      'board.deleteConfirm': '删除这个画板？该操作不可撤销。',
      'board.imported': '已导入画板',
      'board.list': '画板列表',
      'action.import': '导入 JSON',
      'action.exportJson': '导出 JSON',
      'undo.partial': '部分修改已被别人改过，已跳过',
      'err.load': '画板加载失败，请刷新页面重试',
      'err.save': '保存失败，请刷新页面',
      'err.undo': '撤销失败，请稍后再试',
      'err.board': '画板操作失败',
      'err.export': '导出失败',
      'err.import': '导入失败：请选择有效的画板 JSON',
    };
    const DICT_EN = {
      panel: 'Whiteboard',
      'panel.desc': 'Sketch freely and hand the selection to the AI',
      title: 'Whiteboard',
      'tool.select': 'Select', 'tool.hand': 'Pan', 'tool.pen': 'Pen', 'tool.rect': 'Rectangle',
      'tool.ellipse': 'Ellipse', 'tool.arrow': 'Arrow', 'tool.text': 'Text', 'tool.eraser': 'Eraser',
      'group.tools': 'Tools', 'group.colors': 'Colors',
      'color.ink': 'Ink', 'color.accent': 'Accent', 'color.red': 'Red', 'color.green': 'Green', 'color.amber': 'Amber',
      'action.undo': 'Undo', 'action.redo': 'Redo', 'action.clear': 'Clear board',
      'action.export': 'Export PNG', 'action.fit': 'Reset view',
      'action.zoomIn': 'Zoom in', 'action.zoomOut': 'Zoom out',
      'toast.undo': 'Undo',
            'provenance.ai': 'AI edit',
      'ai.on': 'AI on',
      'ai.off': 'AI off',
      'ai.onShort': 'AI',
      'ai.offShort': 'AI off',
      'ai.onHint': 'AI is on: select objects and insert a reference above the composer',
      'ai.offHint': 'AI is off for this canvas in this session (click to turn on)',
      'ref.addHint': 'Insert the whiteboard selection as a reference',
      'ref.addAria': 'Insert the whiteboard selection as a reference',
      'ref.inserted': 'Reference inserted',
      'ref.insertedHint': 'The reference is in the composer; delete it there',
      'ref.fallback': 'Inserted the short marker (chip fallback)',
      'ref.failed': 'Could not insert the reference',
      'ref.noComposer': 'The composer is not ready yet',
      'snapshot.aria': 'Attach a selection snapshot',
      'snapshot.onHint': 'Selection snapshot: inserting a reference also attaches a picture of the selection',
      'snapshot.offHint': 'Attach a selection snapshot (off by default): insert a picture together with the reference',
      'snapshot.added': 'snapshot attached',
      'snapshot.failed': 'could not attach the snapshot (reference kept)',      'canvas.label': 'Whiteboard canvas',
      'hint.title': 'Draw something here',
      'hint.body': 'Sketches, flowcharts, annotations. Everything is saved on the canvas document and shared by this conversation; export as JSON or PNG.',
      'editor.placeholder': 'Type text, Enter to confirm',
      'ai.applied.n': 'AI changed {n} places',
      'board.new': 'New board',
      'board.rename': 'Rename',
      'board.delete': 'Delete',
      'board.renamePrompt': 'Rename board',
      'board.deleteConfirm': 'Delete this board? This cannot be undone.',
      'board.imported': 'Board imported',
      'board.list': 'Boards',
      'action.import': 'Import JSON',
      'action.exportJson': 'Export JSON',
      'undo.partial': 'Some changes were edited by someone else and were skipped',
      'err.load': 'Could not load the board — refresh and try again',
      'err.save': 'Saving failed — refresh the page',
      'err.undo': 'Undo failed, try again later',
      'err.board': 'Board operation failed',
      'err.export': 'Export failed',
      'err.import': 'Import failed: choose a valid board JSON',
    };

    const CSS = [
      '.dsh-wb{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}',
      '.dsh-wb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}',
      '.dsh-wb-title{font-size:13px;font-weight:600;margin:0 6px 0 2px;white-space:nowrap}',
      '.dsh-wb-group{display:flex;align-items:center;gap:2px}',
      '.dsh-wb-sep{width:1px;height:18px;background:var(--dsw-alias-border-l1);margin:0 2px;flex:none}',
      '.dsh-wb-btn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none}',
      '.dsh-wb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-wb-btn[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-wb-btn:disabled{opacity:.35;cursor:default}',
      '.dsh-wb-btn:focus-visible,.dsh-wb-zoom:focus-visible,.dsh-wb-swatch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-wb-swatch{width:18px;height:18px;border:0;border-radius:50%;padding:0;margin:0 2px;cursor:pointer;flex:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent)}',
      '.dsh-wb-swatch[aria-pressed="true"]{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 3.5px var(--dsw-alias-brand-primary)}',
      '.dsh-wb-spacer{flex:1 1 auto;min-width:6px}',
      '.dsh-wb-zoom{min-width:46px;height:28px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-variant-numeric:tabular-nums;cursor:pointer}',
      '.dsh-wb-zoom:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-wb-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}',
      '.dsh-wb-canvas{display:block;width:100%;height:100%;touch-action:none}',
      '.dsh-wb-hint{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px;text-align:center;pointer-events:none;color:var(--dsw-alias-label-secondary)}',
      '.dsh-wb-hint-title{font-size:16px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-wb-hint-body{font-size:12.5px;line-height:1.7;max-width:440px}',
      '.dsh-wb-keys{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;font-size:11.5px}',
      '.dsh-wb-kbd{border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:0 5px;line-height:17px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}',
      '.dsh-wb-editor{position:absolute;z-index:2;margin:0;padding:0;border:0;outline:1px dashed var(--dsw-alias-brand-primary);outline-offset:4px;background:transparent;resize:none;overflow:hidden;white-space:pre;line-height:1.3;font-family:inherit;color:var(--dsw-alias-label-primary);min-width:140px}',
      '.dsh-wb-toast{position:absolute;z-index:3;left:50%;top:12px;transform:translateX(-50%);max-width:min(520px,90%);padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;box-shadow:0 4px 14px rgba(0,0,0,.12);pointer-events:none}',
      '.dsh-wb-toast-act{pointer-events:auto;margin-left:8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;padding:1px 8px;cursor:pointer}',
      '.dsh-wb-toast-act:hover{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}',
        '.dsh-wb-tip{position:absolute;z-index:4;padding:2px 7px;border-radius:6px;font-size:11.5px;line-height:1.5;white-space:nowrap;pointer-events:none;color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);opacity:.92}',
      '.dsh-wb-ai-toggle{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;flex:none}',
      '.dsh-wb-ai-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-wb-ai-toggle[aria-pressed="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-wb-ai-label{white-space:nowrap}',
      '.dsh-wb-snapshot-toggle[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',      '.dsh-wb-panel{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0}',
      '.dsh-wb-panel>.dsh-wb{flex:1 1 auto;min-height:0}',
      '.dsh-wb-ref-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid currentColor;border-radius:6px;padding:0 6px;font-size:.92em;line-height:1.6;opacity:.92;vertical-align:baseline}',
      '.dsh-wb-board{position:relative;display:flex;align-items:center}',
      '.dsh-wb-board-btn{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:230px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-wb-board-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-wb-board-caret{color:var(--dsw-alias-label-secondary);font-size:10px;flex:none}',
      '.dsh-wb-board-pop{position:absolute;top:32px;left:0;z-index:40;width:min(300px,84vw);padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.16);display:flex;flex-direction:column;gap:2px}',
      '.dsh-wb-board-head{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:4px 8px 2px}',
      '.dsh-wb-board-row{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}',
      '.dsh-wb-board-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-wb-board-row[aria-current="true"]{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-wb-board-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto}',
      '.dsh-wb-board-meta{color:var(--dsw-alias-label-secondary);font-size:11px;flex:none}',
      '.dsh-wb-board-sep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px;flex:none}',
      '.dsh-wb-board-actions{display:flex;flex-wrap:wrap;gap:2px;padding:2px}',
      '.dsh-wb-board-act{border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:4px 8px;cursor:pointer}',
      '.dsh-wb-board-act:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',

    ].join('\n');

    const ICON_SHAPES = {
      select: [['path', { d: 'M5 3.5 19 11.5l-5.6 1.2L10.2 19z' }]],
      hand: [
        ['path', { d: 'M18 11V6a2 2 0 0 0-4 0v5' }],
        ['path', { d: 'M14 10V4a2 2 0 0 0-4 0v2' }],
        ['path', { d: 'M10 10.5V5.5a2 2 0 0 0-4 0V14' }],
        ['path', { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15' }],
      ],
      pen: [['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }], ['path', { d: 'M15 5.5l3 3' }]],
      rect: [['rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 2 }]],
      ellipse: [['ellipse', { cx: 12, cy: 12, rx: 8.5, ry: 6.5 }]],
      arrow: [['path', { d: 'M5 19 19 5' }], ['path', { d: 'M11 5h8v8' }]],
      text: [['path', { d: 'M5 6V4.5h14V6' }], ['path', { d: 'M12 4.5v15' }], ['path', { d: 'M9 19.5h6' }]],
      ai: [
        ['path', { d: 'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8-4.8-1.7 4.8-1.7z' }],
        ['path', { d: 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z' }],
      ],
      eraser: [
        ['path', { d: 'm7 21-4.3-4.3a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21' }],
        ['path', { d: 'M22 21H7' }], ['path', { d: 'm5 11 5 5' }],
      ],
      undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H10' }]],
      redo: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H9.5a5.5 5.5 0 0 0 0 11H14' }]],
      trash: [
        ['path', { d: 'M3 6h18' }], ['path', { d: 'M8 6V4h8v2' }],
        ['path', { d: 'M19 6l-1 14H6L5 6' }], ['path', { d: 'M10 10v6' }], ['path', { d: 'M14 10v6' }],
      ],
      download: [['path', { d: 'M12 3v12' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M4 21h16' }]],
      fit: [['path', { d: 'M4 9V4h5' }], ['path', { d: 'M20 9V4h-5' }], ['path', { d: 'M4 15v5h5' }], ['path', { d: 'M20 15v5h-5' }]],
      image: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }],
        ['path', { d: 'm4.5 16 4.5-4.5 3.5 3.5 3-3 4 4' }],
        ['circle', { cx: 9, cy: 9.5, r: 1.4 }],
      ],
      minus: [['path', { d: 'M5 12h14' }]],
      plus: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
    };

    let idCounter = 0;

    function newId(prefix) {
      idCounter += 1;
      return prefix + '-' + Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    }

    function randomSeed() {
      return ((Math.random() * 0xffffffff) >>> 0) || 1;
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function makeRandom(seed) {
      let state = seed >>> 0 || 1;
      return function next() {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
      };
    }

    function isNumber(value) {
      return typeof value === 'number' && window.isFinite(value);
    }

    /* ------------------------------------------------------------------ */
    /* Element model                                                        */
    /* ------------------------------------------------------------------ */

    function cloneElement(element) {
      return JSON.parse(JSON.stringify(element));
    }

    let lastFontFamily = 'system-ui, sans-serif';
    const textMetricsCache = new Map();

    function boundsOf(element, fontFamily) {
      if (!element) return null;
      if (element.type === 'pen') {
        const points = element.points || [];
        if (points.length === 0) return null;
        let x1 = points[0][0], y1 = points[0][1], x2 = x1, y2 = y1;
        for (let i = 1; i < points.length; i += 1) {
          const point = points[i];
          if (point[0] < x1) x1 = point[0];
          if (point[0] > x2) x2 = point[0];
          if (point[1] < y1) y1 = point[1];
          if (point[1] > y2) y2 = point[1];
        }
        return { x1: x1, y1: y1, x2: x2, y2: y2 };
      }
      if (element.type === 'text') {
        const size = element.size || TEXT_SIZE;
        /* Text is painted from its real font metrics and is never clipped to a
           stored box, so `w`/`h` can go stale after a content change (for
           example the AI replacing 你好世界 with Hello World leaves w=88).
           Measure the current text instead: selection, hit-testing and marquee
           then always match what is on screen. */
        const metrics = measuredTextMetrics(element.text, size, fontFamily || lastFontFamily);
        return { x1: element.x, y1: element.y, x2: element.x + metrics.w, y2: element.y + metrics.h };
      }
      const x2 = element.x + element.w;
      const y2 = element.y + element.h;
      return {
        x1: Math.min(element.x, x2),
        y1: Math.min(element.y, y2),
        x2: Math.max(element.x, x2),
        y2: Math.max(element.y, y2),
      };
    }

    function unionBounds(a, b) {
      return {
        x1: Math.min(a.x1, b.x1),
        y1: Math.min(a.y1, b.y1),
        x2: Math.max(a.x2, b.x2),
        y2: Math.max(a.y2, b.y2),
      };
    }

    /* Union of the given elements' bounds, or null when nothing is drawable.
       Used by the optional selection snapshot attached to a reference (B6). */
    function selectionBounds(elements) {
      let union = null;
      for (let i = 0; i < (elements || []).length; i += 1) {
        const bounds = boundsOf(elements[i]);
        if (!bounds) continue;
        union = union === null ? bounds : unionBounds(union, bounds);
      }
      return union;
    }

    function moveElement(element, dx, dy) {
      if (element.type === 'pen') {
        element.points = element.points.map(function (point) { return [point[0] + dx, point[1] + dy]; });
        return;
      }
      element.x += dx;
      element.y += dy;
    }

    function hitsElement(element, wx, wy, padding) {
      const bounds = boundsOf(element);
      if (!bounds) return false;
      return wx >= bounds.x1 - padding && wx <= bounds.x2 + padding
        && wy >= bounds.y1 - padding && wy <= bounds.y2 + padding;
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                            */
    /* ------------------------------------------------------------------ */

    function paletteCss(id) {
      const item = PALETTE.find(function (candidate) { return candidate.id === id; }) || PALETTE[0];
      return 'var(' + item.token + ', ' + item.fallback + ')';
    }

    function readLook(root) {
      const style = window.getComputedStyle(root);
      const read = function (token, fallback) {
        const value = style.getPropertyValue(token);
        return value && value.trim() ? value.trim() : fallback;
      };
      lastFontFamily = (style.fontFamily || '').trim() || 'system-ui, sans-serif';
      return {
        background: read('--dsw-alias-bg-base', '#ffffff'),
        grid: read('--dsw-alias-border-l1', '#d6d9df'),
        accent: read('--dsw-alias-state-business-primary', '#2f6fed'),
        font: lastFontFamily,
        colors: {
          ink: read('--dsw-alias-label-primary', '#1f2329'),
          accent: read('--dsw-alias-state-business-primary', '#2f6fed'),
          red: read('--dsw-alias-state-error-primary', '#d9343a'),
          green: read('--dsw-alias-state-success-primary', '#2f9e44'),
          amber: read('--dsw-alias-state-warn-primary', '#d98b0f'),
        },
      };
    }

    function drawRough(g, points, seed, closed) {
      for (let pass = 0; pass < 2; pass += 1) {
        const rand = makeRandom((seed + pass * 2654435761) >>> 0);
        const amount = pass === 0 ? 1 : 1.5;
        g.beginPath();
        for (let i = 0; i < points.length; i += 1) {
          const x = points[i][0] + (rand() * 2 - 1) * amount;
          const y = points[i][1] + (rand() * 2 - 1) * amount;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        if (closed) g.closePath();
        g.stroke();
      }
    }

    function drawArrowHead(g, x1, y1, x2, y2, width) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const length = 10 + width * 2;
      const spread = 0.44;
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 - length * Math.cos(angle - spread), y2 - length * Math.sin(angle - spread));
      g.moveTo(x2, y2);
      g.lineTo(x2 - length * Math.cos(angle + spread), y2 - length * Math.sin(angle + spread));
      g.stroke();
    }

    function drawPen(g, element) {
      const points = element.points;
      if (points.length === 1) {
        g.beginPath();
        g.arc(points[0][0], points[0][1], Math.max(0.8, (element.width || 2.2) / 2), 0, Math.PI * 2);
        g.fill();
        return;
      }
      g.beginPath();
      g.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i += 1) {
        const midX = (points[i][0] + points[i + 1][0]) / 2;
        const midY = (points[i][1] + points[i + 1][1]) / 2;
        g.quadraticCurveTo(points[i][0], points[i][1], midX, midY);
      }
      const last = points[points.length - 1];
      g.lineTo(last[0], last[1]);
      g.stroke();
    }

    let measureContext = null;

    function textBlockMetrics(text, size, fontFamily) {
      const lines = String(text || '').split('\n');
      if (measureContext === null && typeof document !== 'undefined') {
        measureContext = document.createElement('canvas').getContext('2d') || false;
      }
      let width = 0;
      if (measureContext) {
        measureContext.font = '500 ' + size + 'px ' + fontFamily;
        for (let i = 0; i < lines.length; i += 1) width = Math.max(width, measureContext.measureText(lines[i]).width);
      } else {
        for (let i = 0; i < lines.length; i += 1) width = Math.max(width, lines[i].length * size * 0.58);
      }
      return { lines: lines, w: width, h: (lines.length - 1) * size * 1.3 + size };
    }

    function measuredTextMetrics(text, size, fontFamily) {
      const key = fontFamily + '\u0000' + size + '\u0000' + String(text || '');
      let metrics = textMetricsCache.get(key);
      if (metrics === undefined) {
        metrics = textBlockMetrics(text, size, fontFamily);
        if (textMetricsCache.size > 512) textMetricsCache.clear();
        textMetricsCache.set(key, metrics);
      }
      return metrics;
    }

    function drawText(g, element, fontFamily) {
      const size = element.size || TEXT_SIZE;
      g.font = '500 ' + size + 'px ' + fontFamily;
      g.textBaseline = 'top';
      const metrics = measuredTextMetrics(element.text, size, fontFamily);
      for (let i = 0; i < metrics.lines.length; i += 1) {
        g.fillText(metrics.lines[i], element.x, element.y + i * size * 1.3);
      }
    }

    function drawElement(g, element, look) {
      const ink = (look.colors && look.colors[element.color]) || look.colors.ink;
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = STROKE_WIDTH;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (element.type === 'pen') { drawPen(g, element); return; }
      if (element.type === 'text') { drawText(g, element, look.font); return; }
      const x = element.x;
      const y = element.y;
      const right = element.x + element.w;
      const bottom = element.y + element.h;
      if (element.type === 'rect') {
        const bounds = boundsOf(element);
        if (bounds.x2 - bounds.x1 < 0.6 || bounds.y2 - bounds.y1 < 0.6) {
          drawRough(g, [[x, y], [right, bottom]], element.seed, false);
          return;
        }
        drawRough(g, [[bounds.x1, bounds.y1], [bounds.x2, bounds.y1], [bounds.x2, bounds.y2], [bounds.x1, bounds.y2]], element.seed, true);
        return;
      }
      if (element.type === 'ellipse') {
        const bounds = boundsOf(element);
        const cx = (bounds.x1 + bounds.x2) / 2;
        const cy = (bounds.y1 + bounds.y2) / 2;
        const rx = Math.max(0.5, (bounds.x2 - bounds.x1) / 2);
        const ry = Math.max(0.5, (bounds.y2 - bounds.y1) / 2);
        for (let pass = 0; pass < 2; pass += 1) {
          const rand = makeRandom((element.seed + pass * 2654435761) >>> 0);
          g.beginPath();
          g.ellipse(cx + (rand() * 2 - 1) * 0.9, cy + (rand() * 2 - 1) * 0.9, rx, ry, (rand() * 2 - 1) * 0.02, 0, Math.PI * 2);
          g.stroke();
        }
        return;
      }
      if (element.type === 'arrow') {
        drawRough(g, [[x, y], [right, bottom]], element.seed, false);
        drawArrowHead(g, x, y, right, bottom, STROKE_WIDTH);
      }
    }

    function drawElements(g, elements, look) {
      for (let i = 0; i < elements.length; i += 1) drawElement(g, elements[i], look);
    }

    function drawGrid(g, size, cam, look) {
      const step = 32 * cam.zoom;
      if (step < 18) return;
      const columns = Math.ceil(size.w / step) + 1;
      const rows = Math.ceil(size.h / step) + 1;
      if (columns * rows > 8000) return;
      const offsetX = ((cam.x * cam.zoom) % step + step) % step;
      const offsetY = ((cam.y * cam.zoom) % step + step) % step;
      g.fillStyle = look.grid;
      g.globalAlpha = 0.45;
      for (let x = -offsetX; x <= size.w; x += step) {
        for (let y = -offsetY; y <= size.h; y += step) {
          g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
      }
      g.globalAlpha = 1;
    }

    function drawSelection(g, element, cam, look) {
      const bounds = boundsOf(element, look.font);
      if (!bounds) return;
      const pad = 4;
      g.save();
      g.strokeStyle = look.accent;
      g.lineWidth = 1;
      g.setLineDash([5, 4]);
      g.strokeRect(
        (bounds.x1 - cam.x) * cam.zoom - pad,
        (bounds.y1 - cam.y) * cam.zoom - pad,
        (bounds.x2 - bounds.x1) * cam.zoom + pad * 2,
        (bounds.y2 - bounds.y1) * cam.zoom + pad * 2,
      );
      g.restore();
    }

    function drawMarquee(g, rect, look) {
      const x = Math.min(rect.x1, rect.x2);
      const y = Math.min(rect.y1, rect.y2);
      const width = Math.abs(rect.x2 - rect.x1);
      const height = Math.abs(rect.y2 - rect.y1);
      g.save();
      g.strokeStyle = look.accent;
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.fillStyle = look.accent;
      g.globalAlpha = 0.08;
      g.fillRect(x, y, width, height);
      g.globalAlpha = 1;
      g.strokeRect(x + 0.5, y + 0.5, width, height);
      g.restore();
    }

    /* ------------------------------------------------------------------ */
    /* Glyphs                                                               */
    /* ------------------------------------------------------------------ */

    function Glyph(props) {
      const shapes = ICON_SHAPES[props.name] || [];
      const children = shapes.map(function (shape, index) {
        return h(shape[0], Object.assign({ key: 'shape-' + index }, shape[1]));
      });
      return h('svg', {
        width: props.size, height: props.size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      }, children);
    }

    function WhiteboardGlyph(props) {
      return h('svg', {
        width: props.size, height: props.size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('rect', { key: 'board', x: 3, y: 3.5, width: 18, height: 13, rx: 2 }),
        h('path', { key: 'stroke', d: 'M7.2 11.6c1.1-1.8 2.1-1.8 3.2 0s2.1 1.8 3.2 0 1.6-1.4 2.2-.5' }),
        h('path', { key: 'leg-left', d: 'M8.5 20.2 6 16.5' }),
        h('path', { key: 'leg-right', d: 'M15.5 20.2 18 16.5' }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Host + client registration                                           */
    /* ------------------------------------------------------------------ */

    return {
      name: '@local/whiteboard',
      inject: ['slots', 'locale', 'sessions', 'inputTriggers', 'uiConversation', 'sidebarRightTabs'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);

        /* The composer dock talks to the session shell directly: no prompt
           API is needed any more, because the user sends from the normal
           composer and the model reaches the canvas through its tools. */
        const sessions = ctx.get('sessions');
        const conversations = ctx.get('conversation');
        const uiConversation = ctx.get('uiConversation');
        const sidebarRightTabs = ctx.get('sidebarRightTabs');

        ctx.effect(function () {
          /* A duplicate registration can only happen when a newer generation of
             this module loads before the previous one unloads. Never let that
             take the panel down: keep whichever dictionary is already there. */
          function tryRegister(locale, dictionary) {
            try {
              return ctx.locale.register(NS, locale, dictionary);
            } catch (error) {
              return function () {};
            }
          }
          const disposeZh = tryRegister('zh', DICT_ZH);
          const disposeEn = tryRegister('en', DICT_EN);
          return function () {
            disposeZh();
            disposeEn();
          };
        }, 'whiteboard: dictionaries');

        function WhiteboardPage(props) {
          const rootRef = React.useRef(null);
          const stageRef = React.useRef(null);
          const canvasRef = React.useRef(null);
          const editorRef = React.useRef(null);

          const [tool, setTool] = React.useState('select');
          const [color, setColor] = React.useState('ink');
          const [zoomView, setZoomView] = React.useState(1);
          const [undoState, setUndoState] = React.useState({ canUndo: false, canRedo: false });
          const [drawing, setDrawing] = React.useState(false);
          const [textDraft, setTextDraft] = React.useState(null);
          const store = bridgeStoreFor(props && props.sessionId ? props.sessionId : '');
          const [aiEnabled, setAiEnabled] = React.useState(true);
          const [snapshotOn, setSnapshotOn] = React.useState(false);
          const [aiToast, setAiToast] = React.useState(null);          const [boardName, setBoardName] = React.useState('画板');
          const [boards, setBoards] = React.useState([]);
          const [boardOpen, setBoardOpen] = React.useState(false);
          const [hoverTip, setHoverTip] = React.useState(null);
          const [, bump] = React.useReducer(function (n) { return n + 1; }, 0);

          const elsRef = React.useRef([]);
          const selRef = React.useRef([]);
          const marqueeRef = React.useRef(null);
          const revRef = React.useRef(0);
          const canvasIdRef = React.useRef('');
          const camRef = React.useRef({ x: -80, y: -80, zoom: 1 });
          const dragRef = React.useRef(null);
          const draftRef = React.useRef(null);
          const textDraftRef = React.useRef(null);
          const sizeRef = React.useRef({ w: 0, h: 0, dpr: 1 });
          const drawRef = React.useRef(function () {});
          const rafRef = React.useRef(0);
          const toastTimerRef = React.useRef(0);
          const initRef = React.useRef(false);
          const hadCameraRef = React.useRef(false);
          const baseRef = React.useRef(new Map());
          const changesRef = React.useRef(new Map());
          const cursorRef = React.useRef(0);
          const undoStackRef = React.useRef([]);
          const redoStackRef = React.useRef([]);
          const appliedSeqRef = React.useRef(new Set());
          const provenanceRef = React.useRef(new Map());
          const flushTimerRef = React.useRef(0);
          const flushingRef = React.useRef(false);
          const flushQueuedRef = React.useRef(false);
          const syncingRef = React.useRef(false);

          const colorRef = React.useRef(color);
          colorRef.current = color;
          const boardNameRef = React.useRef('画板');

          /* ---------------- drawing ---------------- */

          function scheduleDraw() {
            if (rafRef.current) return;
            rafRef.current = window.requestAnimationFrame(function () {
              rafRef.current = 0;
              drawRef.current();
            });
          }

          function draw() {
            const canvas = canvasRef.current;
            const root = rootRef.current;
            if (!canvas || !root) return;
            const g = canvas.getContext('2d');
            if (!g) return;
            const size = sizeRef.current;
            const cam = camRef.current;
            const look = readLook(root);
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, canvas.width, canvas.height);
            g.fillStyle = look.background;
            g.fillRect(0, 0, canvas.width, canvas.height);
            g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
            drawGrid(g, size, cam, look);
            const k = cam.zoom * size.dpr;
            g.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
            drawElements(g, elsRef.current, look);
            if (draftRef.current) drawElement(g, draftRef.current, look);
            g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
            const selected = selectedElements();
            for (let i = 0; i < selected.length; i += 1) drawSelection(g, selected[i], cam, look);
            if (marqueeRef.current) drawMarquee(g, marqueeRef.current, look);
            if (provenanceRef.current.size > 0) drawAiOverlays(g, cam, look);
          }
          drawRef.current = draw;

          function syncSize() {
            const stage = stageRef.current;
            const canvas = canvasRef.current;
            if (!stage || !canvas) return;
            const rect = stage.getBoundingClientRect();
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = Math.max(1, Math.round(rect.width));
            const hgt = Math.max(1, Math.round(rect.height));
            sizeRef.current = { w: w, h: hgt, dpr: dpr };
            const pixelWidth = Math.round(w * dpr);
            const pixelHeight = Math.round(hgt * dpr);
            if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
            if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
            if (!initRef.current) {
              initRef.current = true;
              if (!hadCameraRef.current) camRef.current = { x: -w / 2, y: -hgt / 2, zoom: 1 };
              setZoomView(camRef.current.zoom);
            }
            scheduleDraw();
          }

          /* ---------------- Canvas v2 core ----------------
             One conversation-scoped canvas: load once, poll `/sync` by rev,
             flush human edits as diffs against the last confirmed snapshot,
             undo/redo through the Host; the AI reaches it through the model
             tools, so no client-side claim or commit loop lives here. */

          function notify(text, options) {
            const next = { id: Date.now() + ':' + Math.random().toString(36).slice(2, 6), text: String(text || '') };
            if (options && options.undo === true) next.undo = true;
            if (options && isNum(options.seq)) next.seq = options.seq;
            setAiToast(next);
            if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(function () {
              setAiToast(null);
              toastTimerRef.current = 0;
            }, options && options.sticky ? 8000 : 4200);
          }


          function sessionId() { return String(props && props.sessionId ? props.sessionId : ''); }

          async function loadCanvas(targetId) {
            try {
              const query = targetId ? '?canvasId=' + encodeURIComponent(targetId) : '';
              const payload = await apiGet('/canvas' + query);
              const canvas = payload.canvas;
              const elements = [];
              for (let i = 0; i < (canvas.elements || []).length; i += 1) {
                const element = clientElement(canvas.elements[i]);
                if (element) elements.push(element);
              }
              elsRef.current = elements;
              baseRef.current = snapshotOf(elements);
              changesRef.current = new Map();
              cursorRef.current = isNum(canvas.rev) ? canvas.rev : 0;
              revRef.current = cursorRef.current;
              canvasIdRef.current = canvas.id;
              boardNameRef.current = canvas.name || '画板';
              setBoardName(canvas.name || '画板');
              selRef.current = [];
              undoStackRef.current = [];
              redoStackRef.current = [];
              appliedSeqRef.current = new Set();
              setUndoState({ canUndo: false, canRedo: false });
              bump();
              scheduleDraw();
              publishBridge();
              loadAiPref();
            } catch (error) {
              if (error && error.status === 404 && targetId) { await loadCanvas(null); return; }
              notify(t('err.load'));
            }
          }

          function rememberChange(change) {
            if (!change || !isNum(change.seq)) return;
            changesRef.current.set(change.seq, change);
            if (changesRef.current.size > 400) {
              const oldest = changesRef.current.keys().next();
              if (!oldest.done) changesRef.current.delete(oldest.value);
            }
          }

          function markProvenance(change) {
            if (!change) return;
            const until = Date.now() + PROVENANCE_MS;
            for (let i = 0; i < (change.ops || []).length; i += 1) {
              const id = change.ops[i].id;
              if (typeof id === 'string') {
                provenanceRef.current.set(id, {
                  until: until,
                  kind: 'ai',
                  at: change.at || Date.now(),
                });
              }
            }
            scheduleDraw();
            window.setTimeout(function () {
              const now = Date.now();
              provenanceRef.current.forEach(function (value, id) {
                if (!value || value.until <= now) provenanceRef.current.delete(id);
              });
              scheduleDraw();
            }, PROVENANCE_MS + 60);
          }

          function onAiChangeApplied(change) {
            if (!change) return;
            const count = (change.ops || []).length;
            /* The AI change is a normal server change: make it part of the undo
               history so Ctrl+Z still works after the toast expires, and keep the
               toast long enough to be clicked (sticky = 8s). */
            if (isNum(change.seq) && undoStackRef.current.indexOf(change.seq) === -1) {
              undoStackRef.current.push(change.seq);
              redoStackRef.current = [];
              setUndoState({ canUndo: true, canRedo: false });
            }
            notify(t('ai.applied.n').replace('{n}', String(count)), { undo: true, seq: change.seq, sticky: true });
            bump();
            publishBridge();
          }

          async function syncNow() {
            if (!canvasIdRef.current || syncingRef.current) return;
            syncingRef.current = true;
            try {
              const payload = await apiGet('/sync?canvasId=' + encodeURIComponent(canvasIdRef.current) + '&sinceRev=' + cursorRef.current);
              const changes = payload.changes || [];
              let touched = false;
              let aiChange = null;
              for (let i = 0; i < changes.length; i += 1) {
                const change = changes[i];
                if (!isNum(change.seq) || change.seq <= cursorRef.current) continue;
                cursorRef.current = change.seq;
                if (appliedSeqRef.current.has(change.seq)) continue;
                elsRef.current = applyChange(elsRef.current, change);
                appliedSeqRef.current.add(change.seq);
                rememberChange(change);
                touched = true;
                if (change.author && change.author.kind === 'ai') {
                  aiChange = change;
                  markProvenance(change);
                }
              }
              if (isNum(payload.rev)) revRef.current = Math.max(revRef.current, payload.rev);
              if (touched) { bump(); scheduleDraw(); publishBridge(); }
              if (aiChange) onAiChangeApplied(aiChange);
            } catch (error) {
              if (error && error.status === 404) { await loadCanvas(null); return; }
            } finally {
              syncingRef.current = false;
            }
          }

          function scheduleFlush() {
            if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = window.setTimeout(function () {
              flushTimerRef.current = 0;
              flush();
            }, FLUSH_MS);
          }

          async function flush() {
            if (!canvasIdRef.current) return;
            if (flushingRef.current) { flushQueuedRef.current = true; return; }
            const ops = diffOps(baseRef.current, elsRef.current);
            if (ops.length === 0) return;
            flushingRef.current = true;
            const sent = snapshotOf(elsRef.current);
            try {
              const payload = await apiPost('/op', {
                canvasId: canvasIdRef.current,
                sessionId: sessionId(),
                requestId: makeRequestId('op'),
                ops: ops,
              });
              baseRef.current = sent;
              if (isNum(payload.rev)) revRef.current = Math.max(revRef.current, payload.rev);
              if (isNum(payload.changeSeq) && !appliedSeqRef.current.has(payload.changeSeq)) {
                appliedSeqRef.current.add(payload.changeSeq);
                cursorRef.current = Math.max(cursorRef.current, payload.changeSeq);
                if (payload.change) rememberChange(payload.change);
                undoStackRef.current.push(payload.changeSeq);
                if (undoStackRef.current.length > 200) undoStackRef.current.shift();
                redoStackRef.current = [];
                setUndoState({ canUndo: true, canRedo: false });
              }
              if (Array.isArray(payload.rejected) && payload.rejected.length > 0) {
                await loadCanvas(canvasIdRef.current);
              }
            } catch (error) {
              if (error && (error.status === 400 || error.status === 413 || error.status === 422)) {
                notify(t('err.save'));
                await loadCanvas(canvasIdRef.current);
              }
            } finally {
              flushingRef.current = false;
              if (flushQueuedRef.current) {
                flushQueuedRef.current = false;
                scheduleFlush();
              }
            }
          }

          async function undo() {
            const seq = undoStackRef.current.pop();
            if (!seq) return;
            const original = changesRef.current.get(seq) || null;
            try {
              const payload = await apiPost('/undo', {
                canvasId: canvasIdRef.current,
                sessionId: sessionId(),
                seq: seq,
                requestId: makeRequestId('undo'),
              });
              if (payload.change) {
                elsRef.current = applyChange(elsRef.current, payload.change);
                appliedSeqRef.current.add(payload.change.seq);
                cursorRef.current = Math.max(cursorRef.current, payload.change.seq);
                rememberChange(payload.change);
              }
              if (original) redoStackRef.current.push(original);
              if (Array.isArray(payload.skipped) && payload.skipped.length > 0) notify(t('undo.partial'));
              selRef.current = [];
              setUndoState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
              bump();
              scheduleDraw();
            } catch (error) {
              notify(t('err.undo'));
            }
          }

          /* Undo one specific change (the AI commit offered by the provenance
             toast): this is not the human undo stack, it reverses that change
             directly and leaves the rest of the history untouched. */
          async function undoSeq(seq) {
            if (!isNum(seq)) return;
            try {
              const payload = await apiPost('/undo', {
                canvasId: canvasIdRef.current,
                sessionId: sessionId(),
                seq: seq,
                requestId: makeRequestId('undo-ai'),
              });
              if (payload.change) {
                elsRef.current = applyChange(elsRef.current, payload.change);
                appliedSeqRef.current.add(payload.change.seq);
                cursorRef.current = Math.max(cursorRef.current, payload.change.seq);
                rememberChange(payload.change);
              }
              undoStackRef.current = undoStackRef.current.filter(function (entry) { return entry !== seq; });
              setUndoState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
              if (Array.isArray(payload.skipped) && payload.skipped.length > 0) notify(t('undo.partial'));
              bump();
              scheduleDraw();
            } catch (error) {
              notify(t('err.undo'));
            }
          }

          async function redo() {
            const original = redoStackRef.current.pop();
            if (!original) return;
            const ops = redoOpsOf(original);
            if (ops.length === 0) return;
            try {
              const payload = await apiPost('/op', {
                canvasId: canvasIdRef.current,
                sessionId: sessionId(),
                requestId: makeRequestId('redo'),
                ops: ops,
              });
              if (payload.change) {
                elsRef.current = applyChange(elsRef.current, payload.change);
                appliedSeqRef.current.add(payload.change.seq);
                cursorRef.current = Math.max(cursorRef.current, payload.change.seq);
                rememberChange(payload.change);
                undoStackRef.current.push(payload.change.seq);
              }
              baseRef.current = snapshotOf(elsRef.current);
              setUndoState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
              bump();
              scheduleDraw();
            } catch (error) {
              notify(t('err.undo'));
            }
          }

          /* `commit` is the single "the element set changed" seam: every human
             gesture ends here, so the diff flush needs no per-gesture op code. */
          function commit() {
            scheduleFlush();
            bump();
            scheduleDraw();
            publishBridge();
          }


          /* ---------------- board switcher (D15) ---------------- */

          async function refreshBoards() {
            try {
              const payload = await apiGet('/canvases');
              setBoards(payload.canvases || []);
            } catch (error) { /* keep the last list */ }
          }

          async function switchBoard(canvasId) {
            if (!canvasId || canvasId === canvasIdRef.current) return;
            await flush();
            await loadCanvas(canvasId);
            setBoardOpen(false);
            try {
              await apiPost('/session-pref', { sessionId: sessionId(), lastCanvasId: canvasId });
            } catch (error) { /* preference is best effort */ }
          }

          async function createBoard() {
            try {
              const payload = await apiPost('/canvas', { name: '画板 ' + (boards.length + 1) });
              await refreshBoards();
              await switchBoard(payload.canvasId);
            } catch (error) { notify(t('err.board')); }
          }

          async function renameBoard(canvasId) {
            const next = window.prompt(t('board.renamePrompt'), boardName);
            if (next === null) return;
            const name = String(next).trim();
            if (name.length === 0) return;
            try {
              await apiPost('/canvas/rename', { canvasId: canvasId, name: name });
              await refreshBoards();
              if (canvasId === canvasIdRef.current) setBoardName(name);
            } catch (error) { notify(t('err.board')); }
          }

          async function deleteBoard(canvasId) {
            if (!window.confirm(t('board.deleteConfirm'))) return;
            try {
              await apiPost('/canvas/delete', { canvasId: canvasId });
              await refreshBoards();
              if (canvasId === canvasIdRef.current) {
                await loadCanvas(null);
              }
            } catch (error) { notify(t('err.board')); }
          }

          async function exportBoard() {
            try {
              const response = await fetch(API + '/export?canvasId=' + encodeURIComponent(canvasIdRef.current), { credentials: 'same-origin' });
              if (!response.ok) throw new Error('export_failed');
              const text = await response.text();
              const blob = new Blob([text], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              const stamp = new Date();
              const pad = function (n) { return String(n).padStart(2, '0'); };
              anchor.href = url;
              anchor.download = 'whiteboard-' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate())
                + '-' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + '.json';
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
              window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            } catch (error) { notify(t('err.export')); }
          }

          async function importBoard(file) {
            try {
              const text = await file.text();
              const parsed = JSON.parse(text);
              const payload = await apiPost('/import', parsed && parsed.canvas ? parsed : { canvas: parsed });
              await refreshBoards();
              await switchBoard(payload.canvasId);
              notify(t('board.imported'));
            } catch (error) { notify(t('err.import')); }
          }

          /* ---------------- selection helpers ---------------- */

          function findElement(id) {
            const elements = elsRef.current;
            for (let i = 0; i < elements.length; i += 1) {
              if (elements[i].id === id) return elements[i];
            }
            return null;
          }

          function selectedIds() {
            return selRef.current.slice();
          }

          function isSelected(id) {
            return selRef.current.indexOf(id) >= 0;
          }

          function selectedElements() {
            const ids = selRef.current;
            if (ids.length === 0) return [];
            const out = [];
            const elements = elsRef.current;
            for (let i = 0; i < elements.length; i += 1) {
              if (ids.indexOf(elements[i].id) >= 0) out.push(elements[i]);
            }
            return out;
          }

          /* Replace the selection, keeping only ids that still exist. */
          function setSelection(ids) {
            const next = [];
            for (let i = 0; i < ids.length; i += 1) {
              const id = ids[i];
              if (next.indexOf(id) < 0 && findElement(id)) next.push(id);
            }
            selRef.current = next;
            publishBridge();
          }

          function toggleSelection(id) {
            if (isSelected(id)) setSelection(selRef.current.filter(function (item) { return item !== id; }));
            else setSelection(selRef.current.concat([id]));
          }

          function clearSelection() {
            selRef.current = [];
            publishBridge();
          }

          /* ---------------- bridge: selection -> dock chip, AI switch ---------------- */

          function publishBridge() {
            const elements = elsRef.current;
            const canvasId = canvasIdRef.current;
            const mapped = {};
            for (let i = 0; i < elements.length; i += 1) mapped[elements[i].id] = elements[i];
            liveCanvases.set(canvasId, { rev: revRef.current, elements: mapped, objects: bridgeObjectsFor(elements, Object.keys(mapped)) });
            const ids = [];
            const objects = [];
            for (let i = 0; i < selRef.current.length; i += 1) {
              const element = findElement(selRef.current[i]);
              if (!element || element.type === 'pen') continue;
              ids.push(element.id);
              const object = bridgeObject(element);
              if (object) objects.push(object);
            }
            store.set({
              ready: canvasId.length > 0,
              canvasId: canvasId,
              canvasName: boardNameRef.current || '画板',
              rev: revRef.current,
              ids: ids,
              objects: objects,
              label: bridgeLabel({ ids: ids }),
              aiEnabled: aiEnabled,
              snapshot: snapshotOn,
              inserted: false,
            });
          }

          /* ---------------- bridge: optional selection snapshot (B6) ---------------- */

          /** Render the current selection as an opaque PNG (theme background). */
          function snapshotBlob() {
            const chosen = [];
            for (let i = 0; i < selRef.current.length; i += 1) {
              const element = findElement(selRef.current[i]);
              if (element && element.type !== 'pen') chosen.push(element);
            }
            if (chosen.length === 0) return Promise.resolve(null);
            const bounds = selectionBounds(chosen);
            if (!bounds) return Promise.resolve(null);
            const pad = 24;
            const scale = 2;
            const width = Math.max(1, Math.ceil(bounds.x2 - bounds.x1 + pad * 2));
            const height = Math.max(1, Math.ceil(bounds.y2 - bounds.y1 + pad * 2));
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(width * scale);
            canvas.height = Math.ceil(height * scale);
            const g = canvas.getContext('2d');
            if (!g) return Promise.resolve(null);
            const look = readLook(rootRef.current || document.body);
            g.fillStyle = look.background;
            g.fillRect(0, 0, canvas.width, canvas.height);
            g.scale(scale, scale);
            g.translate(pad - bounds.x1, pad - bounds.y1);
            drawElements(g, chosen, look);
            return new Promise(function (resolve) {
              try {
                canvas.toBlob(function (blob) { resolve(blob || null); }, 'image/png');
              } catch (error) { resolve(null); }
            });
          }

          /** Create a runtime image draft and attach it to the live composer. */
          async function attachSnapshot() {
            if (!selRef.current.length) return { ok: false, error: 'empty' };
            const id = sessionId();
            if (!id) return { ok: false, error: 'no_session' };
            const blob = await snapshotBlob();
            if (!blob) return { ok: false, error: 'render_failed' };
            let file = null;
            try {
              file = new File([blob], 'whiteboard-selection.png', { type: 'image/png' });
            } catch (error) { return { ok: false, error: 'file_failed' }; }
            let service = null;
            try {
              const scope = sessions && typeof sessions.scope === 'function' ? sessions.scope(id) : null;
              const scoped = scope && typeof scope.get === 'function' ? scope.get('conversation') : null;
              if (scoped && typeof scoped.createDrafts === 'function') service = scoped;
            } catch (error) { /* fall through to the root service */ }
            if (!service && conversations && typeof conversations.createDrafts === 'function') service = conversations;
            if (!service) return { ok: false, error: 'no_conversation' };
            let drafts = null;
            try { drafts = service.createDrafts(id, [file]); } catch (error) { return { ok: false, error: 'draft_failed' }; }
            const ids = [];
            for (let i = 0; i < (drafts || []).length; i += 1) {
              const draft = drafts[i];
              if (draft && typeof draft.id === 'string') ids.push(draft.id);
            }
            if (ids.length === 0) return { ok: false, error: 'draft_failed' };
            const shell = resolveComposerShell(id);
            if (!shell || !shell.actions || typeof shell.actions.addAttachments !== 'function') return { ok: false, error: 'no_composer' };
            try {
              if (shell.actions.addAttachments(ids) === false) return { ok: false, error: 'attach_failed' };
            } catch (error) { return { ok: false, error: 'attach_failed' }; }
            return { ok: true };
          }

          React.useEffect(function () {
            store.set({ attachSnapshot: attachSnapshot });
            return function () { store.set({ attachSnapshot: null }); };
          }, []);

          async function loadAiPref() {
            if (!canvasIdRef.current) return;
            try {
              const payload = await apiGet('/session-pref?sessionId=' + encodeURIComponent(sessionId()));
              const pref = payload && payload.pref ? payload.pref : null;
              const byCanvas = pref && pref.aiByCanvas && typeof pref.aiByCanvas === 'object' ? pref.aiByCanvas : null;
              const disabled = !!byCanvas && byCanvas[canvasIdRef.current] === false;
              setAiEnabled(!disabled);
              store.set({ aiEnabled: !disabled });
            } catch (error) { /* default is on */ }
          }

          function toggleSnapshot() {
            const next = !snapshotOn;
            setSnapshotOn(next);
            store.set({ snapshot: next });
          }

          async function toggleAi() {
            const next = !aiEnabled;
            setAiEnabled(next);
            store.set({ aiEnabled: next });
            const body = { sessionId: sessionId(), aiByCanvas: {} };
            body.aiByCanvas[canvasIdRef.current] = next;
            try {
              await apiPost('/session-pref', body);
            } catch (error) {
              setAiEnabled(!next);
              store.set({ aiEnabled: !next });
              notify(t('err.save'));
            }
          }

          function pick(wx, wy) {
            const padding = 6 / camRef.current.zoom;
            const elements = elsRef.current;
            for (let i = elements.length - 1; i >= 0; i -= 1) {
              if (hitsElement(elements[i], wx, wy, padding)) return elements[i];
            }
            return null;
          }

          function selectTool(next) {
            setTool(next);
            if (next !== 'select') clearSelection();
            bump();
            scheduleDraw();
          }

          function deleteSelected() {
            const ids = selRef.current.slice();
            if (ids.length === 0) return;
            elsRef.current = elsRef.current.filter(function (element) { return ids.indexOf(element.id) < 0; });
            clearSelection();
            commit();
          }

          function duplicateSelected() {
            const copies = selectedElements().map(function (element) {
              const copy = cloneElement(element);
              copy.id = newId('el');
              copy.seed = hashSeed(copy.id);
              moveElement(copy, 16, 16);
              return copy;
            });
            if (copies.length === 0) return;
            elsRef.current = elsRef.current.concat(copies);
            setSelection(copies.map(function (copy) { return copy.id; }));
            commit();
          }

          function nudge(dx, dy) {
            const selected = selectedElements();
            if (selected.length === 0) return;
            for (let i = 0; i < selected.length; i += 1) moveElement(selected[i], dx, dy);
            commit();
          }

          function clearBoard() {
            if (elsRef.current.length === 0) return;
            elsRef.current = [];
            clearSelection();
            commit();
          }

          /* ---------------- text editor ---------------- */

          function openTextEditor(wx, wy, existing) {
            const cam = camRef.current;
            let index = -1;
            let original = null;
            if (existing) {
              index = elsRef.current.indexOf(existing);
              if (index >= 0) {
                original = existing;
                elsRef.current = elsRef.current.slice();
                elsRef.current.splice(index, 1);
              }
            }
            const worldX = existing ? existing.x : wx;
            const worldY = existing ? existing.y : wy;
            const draft = {
              id: existing ? existing.id : newId('el'),
              index: index,
              original: original,
              value: existing ? existing.text : '',
              color: existing ? existing.color : colorRef.current,
              wx: worldX,
              wy: worldY,
              sx: (worldX - cam.x) * cam.zoom,
              sy: (worldY - cam.y) * cam.zoom,
            };
            textDraftRef.current = draft;
            setTextDraft(draft);
            bump();
            scheduleDraw();
          }

          function updateTextDraft(value) {
            const draft = textDraftRef.current;
            if (!draft) return;
            const next = Object.assign({}, draft, { value: value });
            textDraftRef.current = next;
            setTextDraft(next);
          }

          function commitText() {
            const draft = textDraftRef.current;
            if (!draft) return;
            textDraftRef.current = null;
            setTextDraft(null);
            const value = draft.value.replace(/\s+$/, '');
            if (value.length === 0) {
              if (draft.original) commit();
              else scheduleDraw();
              return;
            }
            const element = {
              id: draft.id,
              type: 'text',
              x: draft.wx,
              y: draft.wy,
              text: value,
              color: draft.color || 'ink',
              seed: draft.original ? draft.original.seed : hashSeed(draft.id),
            };
            const root = rootRef.current;
            const metrics = textBlockMetrics(value, TEXT_SIZE, root ? readLook(root).font : 'system-ui, sans-serif');
            element.w = Math.max(1, metrics.w);
            element.h = Math.max(1, metrics.h);
            const elements = elsRef.current.slice();
            if (draft.index >= 0 && draft.index <= elements.length) elements.splice(draft.index, 0, element);
            else elements.push(element);
            elsRef.current = elements;
            setSelection([element.id]);
            commit();
          }

          function cancelText() {
            const draft = textDraftRef.current;
            if (!draft) return;
            textDraftRef.current = null;
            setTextDraft(null);
            if (draft.original) {
              const elements = elsRef.current.slice();
              const at = Math.max(0, Math.min(draft.index, elements.length));
              elements.splice(at, 0, draft.original);
              elsRef.current = elements;
            }
            bump();
            scheduleDraw();
          }


          /* Provenance halo for elements an AI turn just changed. */
          function drawAiOverlays(g, cam, look) {
            const now = Date.now();
            for (let i = 0; i < elsRef.current.length; i += 1) {
              const element = elsRef.current[i];
              const bounds = boundsOf(element, look.font);
              if (!bounds) continue;
              const provenance = provenanceRef.current.get(element.id);
              if (provenance && provenance.until > now) {
                g.save();
                g.globalAlpha = 0.9;
                g.strokeStyle = look.accent;
                g.lineWidth = 2;
                g.setLineDash([]);
                g.strokeRect(
                  (bounds.x1 - cam.x) * cam.zoom - 6,
                  (bounds.y1 - cam.y) * cam.zoom - 6,
                  (bounds.x2 - bounds.x1) * cam.zoom + 12,
                  (bounds.y2 - bounds.y1) * cam.zoom + 12,
                );
                g.restore();
              }

            }
          }

          /* ---------------- camera ---------------- */

          function zoomAt(sx, sy, factor) {
            const cam = camRef.current;
            const worldX = cam.x + sx / cam.zoom;
            const worldY = cam.y + sy / cam.zoom;
            const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
            if (Math.abs(zoom - cam.zoom) < 0.0005) return;
            cam.zoom = zoom;
            cam.x = worldX - sx / zoom;
            cam.y = worldY - sy / zoom;
            setZoomView(zoom);
            scheduleDraw();
          }

          function zoomBy(factor) {
            const size = sizeRef.current;
            zoomAt(size.w / 2, size.h / 2, factor);
          }

          function fitView() {
            const size = sizeRef.current;
            if (size.w < 10 || size.h < 10) return;
            const cam = camRef.current;
            const elements = elsRef.current;
            let box = null;
            for (let i = 0; i < elements.length; i += 1) {
              const bounds = boundsOf(elements[i]);
              if (!bounds) continue;
              box = box ? unionBounds(box, bounds) : bounds;
            }
            if (!box) {
              cam.zoom = 1;
              cam.x = -size.w / 2;
              cam.y = -size.h / 2;
            } else {
              const pad = 56;
              const width = Math.max(1, box.x2 - box.x1);
              const height = Math.max(1, box.y2 - box.y1);
              const zoom = clamp(Math.min((size.w - pad * 2) / width, (size.h - pad * 2) / height), ZOOM_MIN, 2.5);
              cam.zoom = zoom;
              cam.x = (box.x1 + box.x2) / 2 - size.w / 2 / zoom;
              cam.y = (box.y1 + box.y2) / 2 - size.h / 2 / zoom;
            }
            setZoomView(cam.zoom);
            bump();
            scheduleDraw();
          }

          /* ---------------- export ---------------- */

          function exportPng() {
            const elements = elsRef.current;
            if (elements.length === 0) return;
            let box = null;
            for (let i = 0; i < elements.length; i += 1) {
              const bounds = boundsOf(elements[i]);
              if (!bounds) continue;
              box = box ? unionBounds(box, bounds) : bounds;
            }
            if (!box) return;
            const root = rootRef.current;
            if (!root) return;
            const look = readLook(root);
            const pad = 32;
            const width = Math.max(1, box.x2 - box.x1 + pad * 2);
            const height = Math.max(1, box.y2 - box.y1 + pad * 2);
            const scale = Math.min(2, 4096 / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const g = canvas.getContext('2d');
            if (!g) return;
            g.fillStyle = look.background;
            g.fillRect(0, 0, canvas.width, canvas.height);
            g.setTransform(scale, 0, 0, scale, -(box.x1 - pad) * scale, -(box.y1 - pad) * scale);
            drawElements(g, elements, look);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            const now = new Date();
            const two = (value) => String(value).padStart(2, '0');
            link.download = 'whiteboard-' + now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate())
              + '-' + two(now.getHours()) + '-' + two(now.getMinutes()) + '-' + two(now.getSeconds()) + '.png';
            root.appendChild(link);
            link.click();
            link.remove();
          }

          /* ---------------- pointer input ---------------- */

          function stagePoint(event) {
            const stage = stageRef.current;
            const rect = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
            const sx = event.clientX - rect.left;
            const sy = event.clientY - rect.top;
            const cam = camRef.current;
            return { sx: sx, sy: sy, wx: cam.x + sx / cam.zoom, wy: cam.y + sy / cam.zoom };
          }

          function capturePointer(event) {
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) { /* capture is best effort */ }
          }

          function releasePointer(event) {
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (error) { /* already released */ }
          }

          function createDraft(type, wx, wy, ink) {
            const id = newId('el');
            const element = { id: id, type: type, color: ink, seed: hashSeed(id) };
            if (type === 'pen') element.points = [[wx, wy]];
            if (type === 'rect' || type === 'ellipse' || type === 'arrow') {
              element.x = wx;
              element.y = wy;
              element.w = 0;
              element.h = 0;
            }
            return element;
          }

          function draftReady(element) {
            if (!element) return false;
            if (element.type === 'pen') return element.points.length > 0;
            return Math.abs(element.w) + Math.abs(element.h) > 2;
          }

          function eraseAt(wx, wy) {
            const hit = pick(wx, wy);
            if (!hit) return;
            elsRef.current = elsRef.current.filter(function (element) { return element.id !== hit.id; });
            if (isSelected(hit.id)) setSelection(selRef.current.filter(function (item) { return item !== hit.id; }));
            const drag = dragRef.current;
            if (drag && drag.mode === 'erase') drag.changed = true;
            scheduleDraw();
          }

          function onPointerDown(event) {
            if (textDraftRef.current) { commitText(); return; }
            const point = stagePoint(event);
            const cam = camRef.current;
            if (event.button === 1 || (tool === 'hand' && event.button === 0)) {
              event.preventDefault();
              dragRef.current = { mode: 'pan', sx: point.sx, sy: point.sy, camX: cam.x, camY: cam.y };
              capturePointer(event);
              return;
            }
            if (event.button !== 0) return;
            capturePointer(event);
            if (tool === 'select') {
              const hit = pick(point.wx, point.wy);
              if (hit) {
                if (event.shiftKey) {
                  toggleSelection(hit.id);
                  bump();
                  scheduleDraw();
                  return;
                }
                if (!isSelected(hit.id)) setSelection([hit.id]);
                const ids = selectedIds();
                if (ids.length === 0) return;
                const origs = [];
                for (let i = 0; i < ids.length; i += 1) {
                  const element = findElement(ids[i]);
                  if (element) origs.push({ id: element.id, el: cloneElement(element) });
                }
                dragRef.current = { mode: 'move', ids: ids, wx: point.wx, wy: point.wy, origs: origs, moved: false };
                bump();
                scheduleDraw();
                return;
              }
              /* Empty area starts a marquee; Shift keeps the current selection. */
              if (!event.shiftKey) clearSelection();
              marqueeRef.current = { x1: point.sx, y1: point.sy, x2: point.sx, y2: point.sy };
              dragRef.current = {
                mode: 'marquee',
                sx: point.sx,
                sy: point.sy,
                wx: point.wx,
                wy: point.wy,
                base: event.shiftKey ? selectedIds() : [],
              };
              bump();
              scheduleDraw();
              return;
            }
            if (tool === 'eraser') {
              dragRef.current = { mode: 'erase', changed: false };
              eraseAt(point.wx, point.wy);
              return;
            }
            if (tool === 'text') {
              /* The editor is focused from a React effect right after this
                 handler. Canceling the default here is what keeps that focus:
                 the browser's own mouse-down handling would otherwise move
                 focus to <body> (the canvas is not focusable) and the blur
                 would immediately commit the still-empty draft, which looks
                 exactly like "the text tool does nothing". */
              event.preventDefault();
              openTextEditor(point.wx, point.wy, null);
              return;
            }
            draftRef.current = createDraft(tool, point.wx, point.wy, colorRef.current);
            dragRef.current = { mode: 'draw' };
            setDrawing(true);
            scheduleDraw();
          }

          function onPointerMove(event) {
            const drag = dragRef.current;
            if (!drag) return;
            const point = stagePoint(event);
            const cam = camRef.current;
            if (drag.mode === 'pan') {
              cam.x = drag.camX - (point.sx - drag.sx) / cam.zoom;
              cam.y = drag.camY - (point.sy - drag.sy) / cam.zoom;
              scheduleDraw();
              return;
            }
            if (drag.mode === 'draw') {
              const element = draftRef.current;
              if (!element) return;
              if (element.type === 'pen') {
                const last = element.points[element.points.length - 1];
                const threshold = 1.1 / cam.zoom;
                if (!last || Math.abs(point.wx - last[0]) + Math.abs(point.wy - last[1]) > threshold) {
                  element.points.push([point.wx, point.wy]);
                }
              } else {
                element.w = point.wx - element.x;
                element.h = point.wy - element.y;
              }
              scheduleDraw();
              return;
            }
            if (drag.mode === 'marquee') {
              marqueeRef.current = { x1: drag.sx, y1: drag.sy, x2: point.sx, y2: point.sy };
              scheduleDraw();
              return;
            }
            if (drag.mode === 'move') {
              const dx = point.wx - drag.wx;
              const dy = point.wy - drag.wy;
              drag.moved = Math.abs(dx) + Math.abs(dy) > 0.01;
              const elements = elsRef.current;
              for (let i = 0; i < drag.origs.length; i += 1) {
                const target = cloneElement(drag.origs[i].el);
                moveElement(target, dx, dy);
                for (let j = 0; j < elements.length; j += 1) {
                  if (elements[j].id === drag.origs[i].id) { elements[j] = target; break; }
                }
              }
              scheduleDraw();
              return;
            }
            if (drag.mode === 'erase') eraseAt(point.wx, point.wy);
          }

          function onPointerUp(event) {
            const drag = dragRef.current;
            dragRef.current = null;
            marqueeRef.current = null;
            releasePointer(event);
            if (!drag) return;
            if (drag.mode === 'pan') { scheduleDraw(); return; }
            if (drag.mode === 'marquee') {
              const point = stagePoint(event);
              const wx1 = Math.min(drag.wx, point.wx);
              const wx2 = Math.max(drag.wx, point.wx);
              const wy1 = Math.min(drag.wy, point.wy);
              const wy2 = Math.max(drag.wy, point.wy);
              const ids = drag.base.slice();
              const elements = elsRef.current;
              for (let i = 0; i < elements.length; i += 1) {
                  const bounds = boundsOf(elements[i]);
                if (!bounds) continue;
                if (bounds.x2 < wx1 || bounds.x1 > wx2 || bounds.y2 < wy1 || bounds.y1 > wy2) continue;
                if (ids.indexOf(elements[i].id) < 0) ids.push(elements[i].id);
              }
              setSelection(ids);
              bump();
              scheduleDraw();
              return;
            }
            if (drag.mode === 'move') {
              if (drag.moved) commit();
              else scheduleDraw();
              return;
            }
            if (drag.mode === 'erase') {
              if (drag.changed) commit();
              else scheduleDraw();
              return;
            }
            if (drag.mode === 'draw') {
              const element = draftRef.current;
              draftRef.current = null;
              setDrawing(false);
              if (draftReady(element)) {
                /* rect/ellipse are stored with a positive extent; arrow keeps the
                   signed w/h because its direction is part of the shape. */
                if (element.type === 'rect' || element.type === 'ellipse') {
                  if (element.w < 0) { element.x += element.w; element.w = -element.w; }
                  if (element.h < 0) { element.y += element.h; element.h = -element.h; }
                }
                elsRef.current = elsRef.current.concat([element]);
                setSelection([element.id]);
                commit();
              } else {
                scheduleDraw();
              }
            }
          }

          function onDoubleClick(event) {
            event.preventDefault();
            const point = stagePoint(event);
            const hit = pick(point.wx, point.wy);
            if (hit && hit.type === 'text') openTextEditor(hit.x, hit.y, hit);
          }

          /* ---------------- effects ---------------- */

          React.useEffect(function () {
            let cancelled = false;
            (async function boot() {
              let target = null;
              try {
                const pref = await apiGet('/session-pref?sessionId=' + encodeURIComponent(sessionId()));
                if (pref && pref.pref && typeof pref.pref.lastCanvasId === 'string') target = pref.pref.lastCanvasId;
              } catch (error) { /* fall back to the default canvas */ }
              if (cancelled) return;
              await loadCanvas(target);
              if (cancelled) return;
              refreshBoards();
              syncNow();
            })();
            const poll = window.setInterval(function () { syncNow(); }, SYNC_MS);
            function onVisible() { if (document.visibilityState === 'visible') syncNow(); }
            function onBeforeUnload() { flush(); }
            document.addEventListener('visibilitychange', onVisible);
            window.addEventListener('beforeunload', onBeforeUnload);
            return function () {
              cancelled = true;
              window.clearInterval(poll);
              document.removeEventListener('visibilitychange', onVisible);
              window.removeEventListener('beforeunload', onBeforeUnload);
              flush();
              store.set({ ready: false, ids: [] });
              if (flushTimerRef.current) {
                window.clearTimeout(flushTimerRef.current);
                flushTimerRef.current = 0;
              }
              if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
              }
              if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = 0;
              }
            };
          }, []);

          React.useEffect(function () {
            const stage = stageRef.current;
            if (!stage) return undefined;
            const observer = new window.ResizeObserver(function () { syncSize(); });
            observer.observe(stage);
            syncSize();
            return function () { observer.disconnect(); };
          }, []);

          React.useEffect(function () {
            const canvas = canvasRef.current;
            if (!canvas) return undefined;
            function onWheel(event) {
              event.preventDefault();
              const rect = canvas.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const cam = camRef.current;
              if (event.ctrlKey || event.metaKey) {
                zoomAt(sx, sy, Math.exp(-event.deltaY * 0.0015));
                return;
              }
              cam.x += event.deltaX / cam.zoom;
              cam.y += event.deltaY / cam.zoom;
              scheduleDraw();
            }
            canvas.addEventListener('wheel', onWheel, { passive: false });
            return function () { canvas.removeEventListener('wheel', onWheel); };
          }, []);

          /* Keyboard shortcuts are scoped to the canvas view (the section is
             focusable and receives focus on pointer down). A window-level
             listener would steal Delete / arrows / Ctrl+Z from the conversation
             and from any other text field on the page. */
          function onCanvasKeyDown(event) {
            const target = event.target;
            const tag = target && target.tagName ? target.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
            const mod = event.metaKey || event.ctrlKey;
            const key = event.key;
            if (mod && (key === 'z' || key === 'Z')) {
              event.preventDefault();
              if (event.shiftKey) redo();
              else undo();
              return;
            }
            if (mod && (key === 'y' || key === 'Y')) { event.preventDefault(); redo(); return; }
            if (mod && (key === 'd' || key === 'D')) { event.preventDefault(); duplicateSelected(); return; }
            if (mod && (key === 'a' || key === 'A')) {
              event.preventDefault();
              setSelection(elsRef.current.map(function (element) { return element.id; }));
              bump();
              scheduleDraw();
              return;
            }
            if (key === 'Delete' || key === 'Backspace') {
              if (selRef.current.length > 0) { event.preventDefault(); deleteSelected(); }
              return;
            }
            if (key === 'Escape') {
              if (selRef.current.length > 0) {
                clearSelection();
                bump();
                scheduleDraw();
              }
              return;
            }
            if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
              if (selRef.current.length === 0) return;
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              if (key === 'ArrowLeft') nudge(-step, 0);
              if (key === 'ArrowRight') nudge(step, 0);
              if (key === 'ArrowUp') nudge(0, -step);
              if (key === 'ArrowDown') nudge(0, step);
              return;
            }
            if (mod || event.altKey) return;
            const shortcut = SHORTCUTS[key.toLowerCase()];
            if (shortcut) {
              event.preventDefault();
              setTool(shortcut);
              if (shortcut !== 'select') clearSelection();
              bump();
              scheduleDraw();
            }
          }

          React.useEffect(function () {
            const offTheme = ctx.on('theme/change', function () { bump(); scheduleDraw(); });
            const offLocale = ctx.on('locale/change', function () { bump(); });
            return function () {
              offTheme();
              offLocale();
            };
          }, []);

          React.useEffect(function () {
            if (!boardOpen) return undefined;
            function onDocPointer(event) {
              if (rootRef.current && rootRef.current.contains(event.target)) return;
              setBoardOpen(false);
            }
            document.addEventListener('pointerdown', onDocPointer, true);
            return function () { document.removeEventListener('pointerdown', onDocPointer, true); };
          }, [boardOpen]);

          /* Provenance tooltip: hovering an element the AI just touched shows
             who changed it while the highlight is still live. */
          React.useEffect(function () {
            const stage = stageRef.current;
            if (!stage) return undefined;
            function onPointerMove(event) {
              if (dragRef.current) { setHoverTip(null); return; }
              const rect = stage.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const cam = camRef.current;
              const wx = cam.x + sx / cam.zoom;
              const wy = cam.y + sy / cam.zoom;
              const now = Date.now();
              const elements = elsRef.current;
              let hit = null;
              for (let i = elements.length - 1; i >= 0; i -= 1) {
                const provenance = provenanceRef.current.get(elements[i].id);
                if (!provenance || provenance.until <= now) continue;
                if (hitsElement(elements[i], wx, wy, 6 / cam.zoom)) { hit = elements[i]; break; }
              }
              if (!hit) { setHoverTip(null); return; }
              setHoverTip({ x: sx + 12, y: sy + 14, text: t('provenance.ai') });
            }
            function onPointerLeave() { setHoverTip(null); }
            stage.addEventListener('pointermove', onPointerMove);
            stage.addEventListener('pointerleave', onPointerLeave);
            return function () {
              stage.removeEventListener('pointermove', onPointerMove);
              stage.removeEventListener('pointerleave', onPointerLeave);
            };
          }, []);

          React.useEffect(function () {
            if (textDraft && editorRef.current) editorRef.current.focus();
          }, [textDraft === null]);

          React.useEffect(function () { scheduleDraw(); });

          /* ---------------- render ---------------- */

          const hintVisible = elsRef.current.length === 0 && !drawing && !textDraft;
          const cursor = tool === 'select' ? 'default' : tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : 'crosshair';

          const toolButtons = TOOL_ORDER.map(function (id) {
            return h('button', {
              key: 'tool-' + id,
              type: 'button',
              className: 'dsh-wb-btn',
              title: t('tool.' + id) + ' (' + TOOL_KEYS.filter(function (item) { return item[1] === id; })[0][0] + ')',
              'aria-label': t('tool.' + id),
              'aria-pressed': tool === id,
              onClick: function () { selectTool(id); },
            }, h(Glyph, { name: id, size: 17 }));
          });

          const swatches = PALETTE.map(function (item) {
            return h('button', {
              key: 'color-' + item.id,
              type: 'button',
              className: 'dsh-wb-swatch',
              title: t('color.' + item.id),
              'aria-label': t('color.' + item.id),
              'aria-pressed': color === item.id,
              style: { background: paletteCss(item.id) },
              onClick: function () { setColor(item.id); bump(); },
            });
          });

          const hintNode = hintVisible ? h('div', { key: 'hint', className: 'dsh-wb-hint' },
            h('div', { className: 'dsh-wb-hint-title' }, t('hint.title')),
            h('div', { className: 'dsh-wb-hint-body' }, t('hint.body')),
            h('div', { className: 'dsh-wb-keys' }, TOOL_KEYS.map(function (item) {
              return h('span', { key: 'kbd-' + item[1], className: 'dsh-wb-kbd' }, item[0] + ' ' + t('tool.' + item[1]));
            })),
          ) : null;

          const editorNode = textDraft ? h('textarea', {
            key: 'editor',
            ref: editorRef,
            className: 'dsh-wb-editor',
            spellCheck: false,
            placeholder: t('editor.placeholder'),
            value: textDraft.value,
            rows: Math.max(1, textDraft.value.split('\n').length),
            style: {
              left: textDraft.sx + 'px',
              top: textDraft.sy + 'px',
              color: paletteCss(textDraft.color),
              fontWeight: 500,
              fontSize: Math.max(13, 22 * camRef.current.zoom) + 'px',
              width: Math.max(160, Math.min(560, (textDraft.value.length + 2) * 13 * Math.max(0.8, Math.min(1.4, camRef.current.zoom)))) + 'px',
            },
            onChange: function (event) { updateTextDraft(event.target.value); },
            onKeyDown: function (event) {
              event.stopPropagation();
              /* An IME uses Enter/Escape to confirm or cancel a candidate; that
                 keystroke must never commit or cancel the editor itself.
                 keyCode 229 is the "IME is processing" keystroke some browsers
                 still report without isComposing. */
              if ((event.nativeEvent && event.nativeEvent.isComposing) || event.keyCode === 229) return;
              if (event.key === 'Escape') { event.preventDefault(); cancelText(); return; }
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText(); }
            },
            onBlur: function () { if (textDraftRef.current) commitText(); },
          }) : null;

          const boardNode = h('div', { key: 'board', className: 'dsh-wb-board' },
            h('button', {
              type: 'button', className: 'dsh-wb-board-btn',
              title: t('board.list'), 'aria-haspopup': 'true', 'aria-expanded': boardOpen,
              onClick: function (event) {
                event.stopPropagation();
                const next = !boardOpen;
                setBoardOpen(next);
                if (next) refreshBoards();
              },
            }, boardName, h('span', { className: 'dsh-wb-board-caret' }, '▾')),
            boardOpen ? h('div', { className: 'dsh-wb-board-pop', onClick: function (event) { event.stopPropagation(); } },
              h('div', { className: 'dsh-wb-board-head' }, t('board.list')),
              (boards.length > 0 ? boards : [{ id: canvasIdRef.current, name: boardName, elementCount: elsRef.current.length }]).map(function (board) {
                return h('button', {
                  key: 'board-' + board.id, type: 'button', className: 'dsh-wb-board-row',
                  'aria-current': board.id === canvasIdRef.current ? 'true' : undefined,
                  onClick: function () { switchBoard(board.id); },
                },
                  h('span', { key: 'name', className: 'dsh-wb-board-name' }, board.name || '画板'),
                  h('span', { key: 'count', className: 'dsh-wb-board-meta' }, String(board.elementCount || 0)),
                );
              }),
              h('div', { key: 'sep', className: 'dsh-wb-board-sep' }),
              h('div', { key: 'actions', className: 'dsh-wb-board-actions' },
                h('button', { key: 'new', type: 'button', className: 'dsh-wb-board-act', onClick: createBoard }, t('board.new')),
                h('button', { key: 'rename', type: 'button', className: 'dsh-wb-board-act', onClick: function () { renameBoard(canvasIdRef.current); } }, t('board.rename')),
                h('button', { key: 'delete', type: 'button', className: 'dsh-wb-board-act', onClick: function () { deleteBoard(canvasIdRef.current); } }, t('board.delete')),
                h('label', { key: 'import', className: 'dsh-wb-board-act' }, t('action.import'),
                  h('input', {
                    type: 'file', accept: 'application/json,.json', style: { display: 'none' },
                    onChange: function (event) {
                      const file = event.target.files && event.target.files[0];
                      event.target.value = '';
                      if (file) { setBoardOpen(false); importBoard(file); }
                    },
                  }),
                ),
              ),
            ) : null,
          );


          return h('section', {
            ref: rootRef,
            className: 'dsh-wb',
            'aria-label': t('title'),
            tabIndex: 0,
            onKeyDown: onCanvasKeyDown,
            onPointerDownCapture: function () {
              if (rootRef.current && document.activeElement !== rootRef.current) {
                try { rootRef.current.focus({ preventScroll: true }); } catch (error) { rootRef.current.focus(); }
              }
            },
          },
            h('style', { key: 'style' }, CSS),
            h('div', { className: 'dsh-wb-bar' },
              boardNode,
              h('span', { key: 'sep-tools', className: 'dsh-wb-sep' }),
              h('div', { key: 'tools', className: 'dsh-wb-group', role: 'group', 'aria-label': t('group.tools') }, toolButtons),
              h('span', { key: 'sep-colors', className: 'dsh-wb-sep' }),
              h('div', { key: 'colors', className: 'dsh-wb-group', role: 'group', 'aria-label': t('group.colors') }, swatches),
              h('span', { key: 'sep-history', className: 'dsh-wb-sep' }),
              h('button', {
                key: 'ai-toggle', type: 'button', className: 'dsh-wb-ai-toggle',
                title: aiEnabled ? t('ai.onHint') : t('ai.offHint'),
                'aria-label': aiEnabled ? t('ai.on') : t('ai.off'),
                'aria-pressed': aiEnabled,
                onClick: toggleAi,
              },
                h(Glyph, { key: 'glyph', name: 'ai', size: 15 }),
                h('span', { key: 'label', className: 'dsh-wb-ai-label' }, aiEnabled ? t('ai.onShort') : t('ai.offShort')),
              ),
              h('button', {
                key: 'snapshot-toggle', type: 'button', className: 'dsh-wb-btn dsh-wb-snapshot-toggle',
                title: snapshotOn ? t('snapshot.onHint') : t('snapshot.offHint'),
                'aria-label': t('snapshot.aria'),
                'aria-pressed': snapshotOn,
                onClick: toggleSnapshot,
              }, h(Glyph, { name: 'image', size: 16 })),
              h('span', { key: 'sep-history-b', className: 'dsh-wb-sep' }),
              h('div', { key: 'history', className: 'dsh-wb-group' },
                h('button', {
                  key: 'undo', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.undo'), 'aria-label': t('action.undo'),
                  disabled: !undoState.canUndo, onClick: undo,
                }, h(Glyph, { name: 'undo', size: 17 })),
                h('button', {
                  key: 'redo', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.redo'), 'aria-label': t('action.redo'),
                  disabled: !undoState.canRedo, onClick: redo,
                }, h(Glyph, { name: 'redo', size: 17 })),
                h('button', {
                  key: 'clear', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.clear'), 'aria-label': t('action.clear'),
                  disabled: elsRef.current.length === 0, onClick: clearBoard,
                }, h(Glyph, { name: 'trash', size: 17 })),
              ),
              h('span', { key: 'spacer', className: 'dsh-wb-spacer' }),
              h('div', { key: 'view', className: 'dsh-wb-group' },
                h('button', {
                  key: 'zoom-out', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.zoomOut'), 'aria-label': t('action.zoomOut'),
                  onClick: function () { zoomBy(1 / 1.25); },
                }, h(Glyph, { name: 'minus', size: 17 })),
                h('button', {
                  key: 'zoom', type: 'button', className: 'dsh-wb-zoom',
                  title: t('action.fit'), onClick: fitView,
                }, Math.round(zoomView * 100) + '%'),
                h('button', {
                  key: 'zoom-in', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.zoomIn'), 'aria-label': t('action.zoomIn'),
                  onClick: function () { zoomBy(1.25); },
                }, h(Glyph, { name: 'plus', size: 17 })),
                h('button', {
                  key: 'fit', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.fit'), 'aria-label': t('action.fit'), onClick: fitView,
                }, h(Glyph, { name: 'fit', size: 17 })),
                h('button', {
                  key: 'export-json', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.exportJson'), 'aria-label': t('action.exportJson'),
                  onClick: exportBoard,
                }, h(Glyph, { name: 'download', size: 17 })),
                h('button', {
                  key: 'export', type: 'button', className: 'dsh-wb-btn',
                  title: t('action.export'), 'aria-label': t('action.export'),
                  disabled: elsRef.current.length === 0, onClick: exportPng,
                }, h(Glyph, { name: 'fit', size: 17 })),
              ),
            ),
            h('div', { key: 'stage', ref: stageRef, className: 'dsh-wb-stage' },
              h('canvas', {
                key: 'canvas',
                ref: canvasRef,
                className: 'dsh-wb-canvas',
                style: { cursor: cursor },
                'aria-label': t('canvas.label'),
                onPointerDown: onPointerDown,
                onPointerMove: onPointerMove,
                onPointerUp: onPointerUp,
                onPointerCancel: onPointerUp,
                onDoubleClick: onDoubleClick,
                onContextMenu: function (event) { event.preventDefault(); },
              }),
              hintNode,
              hoverTip ? h('div', {
                key: 'tip', className: 'dsh-wb-tip', role: 'status',
                style: { left: hoverTip.x + 'px', top: hoverTip.y + 'px' },
              }, hoverTip.text) : null,
              aiToast ? h('div', { key: 'toast', className: 'dsh-wb-toast', role: 'status' },
                h('span', { key: 'text' }, aiToast.text),
                aiToast.undo ? h('button', {
                  key: 'undo', type: 'button', className: 'dsh-wb-toast-act',
                  onClick: function () {
                    const seq = aiToast.seq;
                    setAiToast(null);
                    undoSeq(seq);
                  },
                }, t('toast.undo')) : null,
              ) : null,
              editorNode,
            ),
          );
        }

        /* ---------------- carrier: right sidebar tab + composer chip ----------------
           The canvas lives in a right-sidebar tab (keepMounted) so it stays
           alongside the conversation. The bridge between canvas and composer is
           per-session external state: the tab publishes the selection, the dock
           inserts a native reference chip, and codec.serialize turns the chip
           into the model-facing translation at submit time. */

        const TAB_ID = '@local/whiteboard';
        const TAB_KIND = 'whiteboard';

        function panelSessionId(props) {
          if (!props) return '';
          if (typeof props.sessionId === 'string') return props.sessionId;
          if (props.session && typeof props.session.id === 'string') return props.session.id;
          return '';
        }

        function WhiteboardPanel(props) {
          return h('div', { className: 'dsh-wb-panel' },
            h(WhiteboardPage, { sessionId: panelSessionId(props) }),
          );
        }

        function WhiteboardTabTitle() {
          return h('span', null, t('panel'));
        }

        function resolveComposerShell(sessionId) {
          if (!sessionId || !sessions) return null;
          try {
            const scope = sessions.scope(sessionId);
            if (!scope) return null;
            const conversation = typeof scope.get === 'function' ? scope.get('conversation') : null;
            if (!conversation || !conversation.input || typeof conversation.input.for !== 'function') return null;
            return conversation.input.for(scope);
          } catch (error) {
            return null;
          }
        }

        function insertReferenceChip(snap, sessionId) {
          const shell = resolveComposerShell(sessionId);
          if (!shell) return { ok: false, error: 'no_composer' };
          const ref = {
            canvasId: snap.canvasId,
            rev: snap.rev,
            ids: snap.ids.slice(),
            name: snap.canvasName,
            objects: snap.objects,
            n: snap.ids.length,
          };
          const chip = { source: REF_SOURCE, ref: ref, label: snap.label, clipboardText: '◈ ' + snap.label };
          try {
            const span = shell.actions.captureInsertion();
            const inserted = shell.insertReference(chip, span);
            if (inserted === false) throw new Error('insert_reference_failed');
            return { ok: true };
          } catch (error) {
            /* Degrade to the typed short marker from DECISIONS B11: the
               interaction stays identical even if the editor API changes. */
            try {
              shell.actions.insertText('[' + snap.label + ']（' + snap.canvasId + ' · rev ' + snap.rev + '）', shell.actions.captureInsertion());
              return { ok: true, fallback: true };
            } catch (fallbackError) {
              return { ok: false, error: String(fallbackError && fallbackError.message ? fallbackError.message : fallbackError) };
            }
          }
        }

        function WhiteboardDock(props) {
          const sessionId = panelSessionId(props);
          const store = bridgeStoreFor(sessionId);
          const [snap, setSnap] = React.useState(store.get());
          const [status, setStatus] = React.useState('');
          React.useEffect(function () {
            const current = store.get();
            if (current !== snap) setSnap(current);
            return store.subscribe(function () { setSnap(store.get()); });
          }, [sessionId]);
          /* If the native composer chip disappears (sent, or deleted by hand),
             re-enable the dock chip so the same selection can be inserted again. */
          React.useEffect(function () {
            if (snap.inserted !== true) return undefined;
            const timer = window.setInterval(function () {
              if (!document.querySelector('span[data-composer-chip="' + REF_SOURCE + '"]')) {
                store.set({ inserted: false });
              }
            }, 400);
            return function () { window.clearInterval(timer); };
          }, [snap.inserted, sessionId]);
          const noteStyle = { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary)', opacity: 0.8 };
          /* The composer card is centred once the conversation column is wider than
             its max-width, so a fixed padding cannot line the dock chip up with it.
             Measure the live input-card inset (also on sidebar/window resize) and
             mirror it; 16px stays as the first-paint fallback. */
          const dockRef = React.useRef(null);
          React.useLayoutEffect(function () {
            const el = dockRef.current;
            if (!el) return undefined;
            const syncInset = function () {
              const editor = document.querySelector('[contenteditable="true"]');
              if (!editor) return;
              const inset = editor.getBoundingClientRect().left - el.getBoundingClientRect().left;
              if (!(inset >= 0 && inset < 400)) return;
              el.style.paddingLeft = inset + 'px';
              el.style.paddingRight = inset + 'px';
            };
            syncInset();
            let observer = null;
            const host = el.closest('[class*="composerStack"]') || el.parentElement;
            if (host && typeof ResizeObserver !== 'undefined') {
              observer = new ResizeObserver(syncInset);
              observer.observe(host);
            }
            window.addEventListener('resize', syncInset);
            return function () {
              window.removeEventListener('resize', syncInset);
              if (observer) observer.disconnect();
            };
          }, [snap.ready, snap.canvasId, snap.ids.length, snap.aiEnabled]);
          if (!snap.ready || !snap.canvasId || snap.ids.length === 0 || snap.aiEnabled === false) {
            /* Keep a failed insertion visible, but do not leave a stale
               "已插入引用" note floating above the composer once the dock hides. */
            const failed = typeof status === 'string' && (status.indexOf(t('ref.failed')) === 0 || status.indexOf(t('snapshot.failed')) !== -1);
            return failed ? h('div', { className: 'dsh-wb-dock-note', style: noteStyle }, status) : null;
          }
          const inserted = snap.inserted === true;
          const onClick = async function () {
            if (inserted) return;
            const result = insertReferenceChip(snap, sessionId);
            if (!result.ok) {
              setStatus(t('ref.failed') + '：' + (result.error === 'no_composer' ? t('ref.noComposer') : result.error));
              return;
            }
            store.set({ inserted: true });
            const parts = [result.fallback ? t('ref.fallback') : t('ref.inserted')];
            if (snap.snapshot === true && typeof snap.attachSnapshot === 'function') {
              setStatus(parts[0] + '…');
              let shot = null;
              try { shot = await snap.attachSnapshot(); } catch (error) { shot = { ok: false, error: 'attach_failed' }; }
              if (shot && shot.ok === true) {
                parts.push(t('snapshot.added'));
              } else {
                parts.push(t('snapshot.failed'));
              }
            }
            setStatus(parts.join('，'));
          };
          /* The composer root has 16px horizontal padding; the dock slot spans the
             full composer stack, so mirror that inset to line the chip up with the
             visible input card instead of sticking out to its left. */
          return h('div', { ref: dockRef, className: 'dsh-wb-dock', style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 16px 0', fontSize: '12px' } },
            h('button', {
              type: 'button',
              className: 'dsh-wb-dock-chip',
              title: inserted ? t('ref.insertedHint') : (snap.snapshot === true ? t('snapshot.onHint') : t('ref.addHint')),
              onClick: onClick,
              'aria-label': t('ref.addAria'),
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                maxWidth: '100%',
                border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: '6px',
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary)',
                font: 'inherit',
                fontSize: '12px',
                lineHeight: '20px',
                padding: '0 8px',
                cursor: inserted ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }, '◈ ' + snap.label),
            status ? h('span', { className: 'dsh-wb-dock-note', style: noteStyle }, status) : null,
          );
        }

        /* ---------------- reference source (codec) ---------------- */

        const referenceSource = {
          trigger: '§',
          name: REF_SOURCE,
          order: 90,
          codec: {
            clipboardText: function (ref) { return '◈ ' + bridgeLabel(ref); },
            serialize: async function (ref, signal) {
              if (signal && signal.aborted) throw new Error('serialize aborted');
              /* Keep the block on its own lines: text typed next to the chip must
                 stay outside the translation so it is neither swallowed by the
                 sent-message rule nor read as part of an object field. */
              return '\n' + bridgeTranslate(ref) + '\n';
            },
          },
        };

        ctx.inject(['inputTriggers'], function (scope) {
          const triggers = scope.inputTriggers || (scope.get && scope.get('inputTriggers'));
          if (!triggers || typeof triggers.registerSource !== 'function') return;
          scope.effect(function () {
            const off = triggers.registerSource(referenceSource);
            return function () { off(); };
          }, 'whiteboard: reference source');
        });

        /* ---------------- sent-message rendering ---------------- */

        const referenceRule = {
          id: REF_RULE_ID,
          order: 90,
          match: function (text, from) {
            /* The reference block is a header line plus one generated line per
               object. Text typed next to the chip is appended with no separator,
               so match only the generated fields: otherwise the whole line
               (including the user's instruction) would collapse into the chip. */
            const objectLine = [
              '- \\S+ · (?:矩形|椭圆) · 位置\\([^)]*\\) · [^·\\n]+×[^·\\n]+ · 填充 #[0-9a-fA-F]{6}',
              '- \\S+ · 箭头 · \\([^)]*\\) → \\([^)]*\\) · 描边 #[0-9a-fA-F]{6} · 线宽 [0-9.]+',
              '- \\S+ · 文本 · 位置\\([^)]*\\) · 字号 [0-9]+ · 颜色 #[0-9a-fA-F]{6} · 内容「[^」]*」',
              '- \\S+ · 已删除（invalid）',
              '- 对象较多（[0-9]+ 个）· 类型统计：[^\\n]*',
              '- id 列表：[^\\n]*',
              '- 请调用 whiteboard_read_selection 读取这些对象的字段后再修改。',
              '- \\S+ · (?:矩形|椭圆|箭头|文本)',
              '- \\S+ · [A-Za-z_-]+',
            ].join('|');
            const re = new RegExp('【画板选区引用】[^\\n]*(?:\\n(?:' + objectLine + '))*', 'gu');
            re.lastIndex = from;
            const match = re.exec(text);
            if (match === null) return undefined;
            const count = /(\d+) 个对象/u.exec(match[0]);
            return {
              id: REF_RULE_ID,
              start: match.index,
              end: match.index + match[0].length,
              data: { label: '画板选区 · ' + (count ? count[1] : '?') + ' 个对象', line: match[0] },
            };
          },
        };

        function WhiteboardUserRef(props) {
          const data = props.node && props.node.data ? props.node.data : {};
          return h('span', { className: 'dsh-wb-ref-chip', title: props.raw || data.line || '' },
            '◈ ' + (data.label || '画板选区'),
          );
        }

        if (uiConversation && uiConversation.userText && typeof uiConversation.userText.register === 'function') {
          uiConversation.userText.register(referenceRule);
        }
        ctx.slots.inject('conversation.user.text.node', function () {
          return ctx.slots.register({
            name: 'conversation.user.text.node',
            key: REF_RULE_ID,
            priority: 100,
          }, WhiteboardUserRef);
        });

        /* ---------------- tab + dock registration ---------------- */

        if (sidebarRightTabs && typeof sidebarRightTabs.register === 'function') {
          ctx.effect(function () {
            return sidebarRightTabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              priority: 'extension',
              keepMounted: true,
              title: function () { return t('panel'); },
              /* The guide is the empty sidebar's doorway, so the board must
                 contribute one entry or users cannot discover the tab. */
              guide: [{
                id: 'whiteboard',
                title: function () { return t('panel'); },
                description: function () { return t('panel.desc'); },
              }],
            });
          }, 'whiteboard: right sidebar tab');
          ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, WhiteboardPanel);
          });
          ctx.slots.inject('sidebar.right.pane.tab.title', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, WhiteboardTabTitle);
          });
        }

        ctx.slots.inject('conversation.input.dock', function () {
          return ctx.slots.register({ name: 'conversation.input.dock', id: 'whiteboard', order: 30 }, WhiteboardDock);
        });
      },

      /* Node-side seam for test/client-smoke.mjs: the pure half of the client
         (element mapping, diff, change application, redo) has no DOM deps. */
      __test: {
        clientElement: clientElement,
        elementFields: elementFields,
        insertOp: insertOp,
        diffOps: diffOps,
        snapshotOf: snapshotOf,
        applyChange: applyChange,
        redoOpsOf: redoOpsOf,
        hashSeed: hashSeed,
        bridgeTranslate: bridgeTranslate,
        bridgeLabel: bridgeLabel,
        bridgeStoreFor: bridgeStoreFor,
        selectionBounds: selectionBounds,
        boundsOf: boundsOf,
        REF_FULL_LIMIT: REF_FULL_LIMIT,
        REF_HEADER: REF_HEADER,
        constants: {
          API: API,
          SYNC_MS: SYNC_MS,
          FLUSH_MS: FLUSH_MS,
                MAX_TEXT: MAX_TEXT,
          MAX_ELEMENTS: MAX_ELEMENTS,
        },
      },
    };
  },
});




























