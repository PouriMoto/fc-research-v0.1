// Block renderers: turn the declarative step definitions (content/<lang>/flows.json) into DOM.

import { getPack, resolveSource, tpl } from './content.js';
import { fieldDefault, fieldValue, picksValue } from './progress.js';
import { images, store } from './store.js';
import { append, autosize, clear, copyText, fmt, h, toast } from './util.js';

export function renderBlocks(blocks, ctx) {
  const frag = document.createDocumentFragment();
  for (const block of blocks || []) {
    const fn = RENDERERS[block.type];
    if (fn) frag.append(fn(block, ctx));
  }
  return frag;
}

const ui = (ctx) => ctx.content.ui;
const data = (ctx) => store.peek(ctx.lesson.id);

/* ------------------------------------------------------------------ static */

function callout(block, ctx) {
  return h('aside', { class: 'callout' },
    block.title ? h('strong', { class: 'callout-title' }, tpl(block.title, ctx.lesson)) : null,
    h('p', {}, tpl(block.text, ctx.lesson)));
}

function card(block, ctx) {
  const list = block.list
    ? h(block.ordered ? 'ol' : 'ul', { class: 'plain-list' }, block.list.map((t) => h('li', {}, t)))
    : null;
  return h('section', { class: 'card' },
    block.title ? h('h3', {}, block.title) : null,
    block.text ? h('p', {}, tpl(block.text, ctx.lesson)) : null,
    list);
}

function stats(block, ctx) {
  const nf = new Intl.NumberFormat(ctx.content.ui.meta.locale);
  const fmtValue = (v) => String(v).replace(/\d+/g, (d) => nf.format(Number(d)));
  return h('dl', { class: 'stats' }, block.items.map((i) =>
    h('div', {}, h('dd', {}, fmtValue(i.value)), h('dt', {}, i.label))));
}

function columns(block, ctx) {
  return h('div', { class: 'columns' }, block.columns.map((col) =>
    h('section', { class: 'card' },
      col.title ? h('h3', {}, col.title) : null,
      renderBlocks(col.blocks, ctx))));
}

function slot(block, ctx) {
  const pack = getPack(ctx.content, ctx.lesson);
  return renderBlocks(pack?.slots?.[block.name], ctx);
}

/* ------------------------------------------------------------------ fields */

function control(f, value, onInput, placeholderFallback) {
  let el;
  if (f.kind === 'textarea') {
    el = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || placeholderFallback || '' });
    el.value = value;
    autosize(el);
  } else if (f.kind === 'select') {
    el = h('select', {}, f.options.map((o) => h('option', { value: o.value }, o.label)));
    el.value = value;
  } else {
    el = h('input', { type: f.kind === 'date' ? 'date' : 'text', placeholder: f.placeholder || '' });
    el.value = value;
  }
  if (onInput) el.addEventListener(f.kind === 'select' ? 'change' : 'input', () => onInput(el.value));
  return el;
}

function fieldWrap(f, el, uid) {
  el.id = uid;
  return h('div', { class: 'field' },
    h('label', { for: uid }, f.label),
    el,
    f.hint ? h('small', {}, f.hint) : null);
}

let uidCounter = 0;
const uid = (p) => `${p}-${++uidCounter}`;

function fields(block, ctx) {
  const wrap = h('div', { class: `fields cols-${block.columns || 1}` });
  for (const f of block.fields) {
    const value = fieldValue(ctx.content, ctx.lesson, f, data(ctx));
    const el = control(f, value, (v) => {
      // Persist only when different from the default, so untouched defaults do not count as progress.
      const def = fieldDefault(ctx.content, ctx.lesson, f);
      store.setField(ctx.lesson.id, f.id, v === def && f.kind !== 'select' && f.kind !== 'date' ? '' : v);
    });
    wrap.append(fieldWrap(f, el, uid('f')));
  }
  return wrap;
}

/* ------------------------------------------------------------------ picker */

function picker(block, ctx) {
  const items = resolveSource(ctx.content, ctx.lesson, block.source);
  if (!items) return h('p', { class: 'muted' }, ui(ctx).blocks.noPreset);
  const root = h('div', { class: 'picker' });
  const pack = getPack(ctx.content, ctx.lesson);

  const draw = () => {
    clear(root);
    const chosen = new Set(picksValue(ctx.content, ctx.lesson, block, data(ctx)));
    const bar = h('div', { class: 'picker-bar' },
      h('span', { class: 'count' }, fmt(ui(ctx).blocks.selected, { n: new Intl.NumberFormat(ui(ctx).meta.locale).format(chosen.size) })),
      (block.presets || []).map((p) => h('button', {
        type: 'button',
        class: 'btn small',
        onclick: () => {
          store.setPicks(ctx.lesson.id, block.id, p.clear ? [] : [...(pack?.[p.pack] || [])]);
          draw();
        },
      }, p.label)));
    const list = h('div', { class: `pick-grid ${block.layout || 'cards'}` }, items.map((item) => {
      const on = chosen.has(item.id);
      return h('button', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': String(on),
        class: `pick${on ? ' on' : ''}`,
        onclick: () => {
          const next = new Set(picksValue(ctx.content, ctx.lesson, block, data(ctx)));
          if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
          store.setPicks(ctx.lesson.id, block.id, [...next]);
          draw();
        },
      },
      h('span', { class: 'tick', 'aria-hidden': 'true' }),
      h('span', { class: 'pick-body' },
        h('strong', {}, item.title, item.subtitle ? h('span', { class: 'sub' }, ` · ${item.subtitle}`) : null),
        item.text ? h('span', { class: 'pick-text' }, item.text) : null,
        item.hint ? h('span', { class: 'pick-hint' }, item.hint) : null));
    }));
    root.append(bar, list);
  };
  draw();
  return root;
}

/* --------------------------------------------------------------- checklist */

function checklist(block, ctx) {
  const source = resolveSource(ctx.content, ctx.lesson, block.source);
  if (!source) return h('p', { class: 'muted' }, ui(ctx).blocks.noPreset);
  const toggle = (id, on) => {
    const set = new Set(data(ctx).checks[block.id] || []);
    if (on) set.add(id); else set.delete(id);
    store.setChecks(ctx.lesson.id, block.id, [...set]);
  };
  const row = (item) => {
    const id = uid('c');
    const input = h('input', { type: 'checkbox', id });
    input.checked = (data(ctx).checks[block.id] || []).includes(item.id);
    input.addEventListener('change', () => toggle(item.id, input.checked));
    return h('label', { class: 'check', for: id }, input, h('span', {}, item.text));
  };
  if (block.grouped) {
    return h('div', { class: 'checklist grouped' }, source.map((g) =>
      h('section', { class: 'card' }, h('h3', {}, g.title), g.items.map(row))));
  }
  return h('div', { class: 'checklist' }, source.map(row));
}

/* ------------------------------------------------------- sources / keywords */

function sources(block, ctx) {
  const list = resolveSource(ctx.content, ctx.lesson, block.source);
  if (!list) return h('p', { class: 'muted' }, ui(ctx).blocks.noPreset);
  const b = ui(ctx).blocks;
  const nf = new Intl.NumberFormat(ui(ctx).meta.locale);
  return h('ol', { class: 'sources' }, list.map((s, i) =>
    h('li', { class: 'source' },
      h('div', { class: 'source-meta' },
        h('span', { class: 'tag' }, s.kind),
        h('span', { class: 'num' }, fmt(b.sourceNumber, { n: nf.format(i + 1) }))),
      h('h3', {}, s.title),
      h('p', {}, s.text),
      h('p', { class: 'usage' }, h('b', {}, `${b.usage}: `), s.usage),
      h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, `${b.openSource} ↗`))));
}

function keywords(block, ctx) {
  const list = resolveSource(ctx.content, ctx.lesson, block.source);
  if (!list) return document.createDocumentFragment();
  const b = ui(ctx).blocks;
  return h('section', { class: 'card' },
    h('h3', {}, block.title),
    h('p', {}, block.text),
    h('div', { class: 'tags' }, list.map((k) => h('span', { class: 'tag' }, k))),
    h('button', {
      type: 'button',
      class: 'btn small',
      onclick: async () => toast((await copyText(list.join('\n'))) ? b.copied : list.join(', ')),
    }, b.copyKeywords));
}

function links(block, ctx) {
  const list = resolveSource(ctx.content, ctx.lesson, block.source);
  if (!list) return document.createDocumentFragment();
  return h('section', { class: 'card' },
    h('h3', {}, block.title),
    h('ul', { class: 'link-list' }, list.map((l) =>
      h('li', {}, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, `${l.title} ↗`)))),
    block.hint ? h('p', { class: 'muted small' }, block.hint) : null);
}

/* --------------------------------------------------------------------- log */

function log(block, ctx) {
  const b = ui(ctx).blocks;
  const root = h('div', { class: 'log' });
  const titleField = block.fields.find((f) => f.role === 'title');
  const badgeField = block.fields.find((f) => f.role === 'badge');
  const inputs = new Map();

  const form = h('div', { class: 'log-form' });
  if (block.ideas) {
    const ideas = resolveSource(ctx.content, ctx.lesson, block.ideas.source);
    if (ideas?.length) {
      form.append(h('section', { class: 'card' },
        h('h3', {}, block.ideas.title),
        h('ul', { class: 'idea-list' }, ideas.map((i) =>
          h('li', {},
            h('span', {}, i.text),
            h('button', {
              type: 'button',
              class: 'btn small ghost',
              onclick: () => {
                const target = inputs.get(block.ideas.target || titleField.id);
                target.value = i.text;
                target.focus();
              },
            }, block.ideas.useLabel))))));
    }
  }
  const grid = h('div', { class: 'fields cols-1' });
  for (const f of block.fields) {
    const el = control(f, f.kind === 'select' ? f.options[0].value : '', null);
    inputs.set(f.id, el);
    grid.append(fieldWrap(f, el, uid('l')));
  }
  const addBtn = h('button', {
    type: 'button',
    class: 'btn primary',
    onclick: () => {
      const entry = {};
      for (const [id, el] of inputs) entry[id] = el.value.trim();
      const missing = block.fields.some((f) => f.required && !entry[f.id]);
      if (missing) { toast(block.required || b.requiredField); return; }
      store.addLog(ctx.lesson.id, block.id, entry);
      for (const f of block.fields) {
        const el = inputs.get(f.id);
        el.value = f.kind === 'select' ? f.options[0].value : '';
        if (f.kind === 'textarea') el.dispatchEvent(new Event('input'));
      }
      drawList();
    },
  }, `+ ${block.addLabel}`);
  form.append(grid, addBtn);

  const list = h('div', { class: 'log-list' });
  const drawList = () => {
    clear(list);
    const entries = data(ctx).logs[block.id] || [];
    if (!entries.length) { list.append(h('p', { class: 'muted' }, block.empty)); return; }
    entries.forEach((entry, index) => {
      const badge = badgeField ? badgeField.options.find((o) => o.value === entry[badgeField.id]) : null;
      list.append(h('article', { class: 'entry' },
        h('header', {},
          h('h3', {}, entry[titleField.id], badge ? h('span', { class: 'tag' }, badge.label.split(' · ')[0]) : null),
          h('button', {
            type: 'button',
            class: 'btn small danger ghost',
            onclick: () => { store.removeLog(ctx.lesson.id, block.id, index); drawList(); },
          }, b.remove)),
        block.fields.filter((f) => f.role !== 'title' && f.role !== 'badge' && entry[f.id]).map((f) =>
          h('p', {}, h('b', {}, `${f.label}: `), entry[f.id]))));
    });
  };
  drawList();
  root.append(form, list);
  return root;
}

/* ------------------------------------------------------------------ images */

function imagesBlock(block, ctx) {
  const b = ui(ctx).blocks;
  const gallery = h('div', { class: 'gallery' });
  const urls = [];
  const draw = async () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    clear(gallery);
    let list = [];
    try { list = await images.list(ctx.lesson.id); } catch { list = []; }
    if (data(ctx).imageCount !== list.length) store.setImageCount(ctx.lesson.id, list.length);
    for (const im of list) {
      const url = URL.createObjectURL(im.blob);
      urls.push(url);
      gallery.append(h('figure', {},
        h('img', { src: url, alt: im.name, loading: 'lazy' }),
        h('figcaption', {}, im.name),
        h('button', {
          type: 'button',
          class: 'btn small danger ghost',
          onclick: async () => { await images.remove(im.id); draw(); },
        }, block.remove || b.remove)));
    }
  };
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, id: uid('img') });
  input.addEventListener('change', async () => {
    for (const file of input.files) {
      try { await images.add(ctx.lesson.id, file); } catch { toast(fmt(b.imageTooBig, { name: file.name })); }
    }
    input.value = '';
    draw();
  });
  draw();
  return h('div', { class: 'field' },
    h('label', { for: input.id }, block.label),
    input,
    block.hint ? h('small', {}, block.hint) : null,
    gallery);
}

/* ----------------------------------------------------------------- actions */

function actions(block, ctx) {
  const b = ui(ctx).blocks;
  const labels = { 'download-md': b.download, 'share-md': b.share, print: b.print };
  return h('div', { class: 'actions' }, block.actions.map((name) =>
    h('button', {
      type: 'button',
      class: `btn${name === 'download-md' ? ' primary' : ''}`,
      onclick: () => ctx.actions?.[name]?.(),
    }, labels[name])));
}

const RENDERERS = { callout, card, stats, columns, slot, fields, picker, checklist, sources, keywords, links, log, images: imagesBlock, actions };

export { append };
