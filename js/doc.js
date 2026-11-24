// Builds an intermediate document (list of nodes) from a lesson, then serialises it to Markdown or DOM.

import { getPack, resolveSource, tpl } from './content.js';
import { fieldValue, lessonProgress, lessonStatus, optionLabel, picksValue, stepsOf } from './progress.js';
import { h } from './util.js';

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

export function buildLessonDoc(content, lesson, data, imageNames = [], stamp = '') {
  const ui = content.ui;
  const md = ui.export.md;
  const progress = lessonProgress(content, lesson, data);
  const status = lessonStatus(progress, data);
  const fmtNumber = new Intl.NumberFormat(ui.meta.locale, { style: 'percent' });
  const pack = getPack(content, lesson);
  const nodes = [];

  nodes.push({ t: 'h1', text: lesson.title });
  nodes.push({
    t: 'front',
    pairs: [
      ['id', lesson.code],
      [md.track, `${lesson.track.name} — ${lesson.track.title}`],
      [md.status, ui.status[status]],
      [md.progress, fmtNumber.format(progress.ratio)],
      [md.exportedOn, stamp],
    ],
  });

  for (const step of stepsOf(content, lesson)) {
    const body = [];
    const walk = (blocks, heading) => {
      for (const b of blocks || []) {
        if (b.type === 'fields') {
          for (const f of b.fields) {
            const value = fieldValue(content, lesson, f, data);
            const shown = f.kind === 'select' ? optionLabel(f, value) : value;
            if (nonEmpty(shown)) body.push({ t: 'h3', text: f.label }, { t: 'p', text: shown });
          }
        } else if (b.type === 'picker') {
          const items = resolveSource(content, lesson, b.source) || [];
          const picked = new Set(picksValue(content, lesson, b, data));
          const chosen = items.filter((i) => picked.has(i.id));
          if (chosen.length) {
            body.push({ t: 'h3', text: heading || b.title || md.selected });
            body.push({ t: 'list', items: chosen.map((i) => ({ text: i.subtitle ? `${i.title} · ${i.subtitle}` : i.title })) });
          }
        } else if (b.type === 'checklist') {
          const source = resolveSource(content, lesson, b.source) || [];
          const checked = new Set(data.checks[b.id] || []);
          if (!checked.size) continue;
          if (b.grouped) {
            body.push({ t: 'h3', text: md.selected });
            for (const g of source) {
              const sel = g.items.filter((i) => checked.has(i.id));
              if (sel.length) body.push({ t: 'p', text: g.title, strong: true }, { t: 'list', items: sel.map((i) => ({ text: i.text })) });
            }
          } else {
            body.push({ t: 'list', items: source.map((i) => ({ text: i.text, checked: checked.has(i.id) })) });
          }
        } else if (b.type === 'log') {
          const entries = data.logs[b.id] || [];
          for (const e of entries) {
            const titleField = b.fields.find((f) => f.role === 'title');
            const badgeField = b.fields.find((f) => f.role === 'badge');
            const badge = badgeField ? optionLabel(badgeField, e[badgeField.id]) : '';
            body.push({ t: 'h3', text: `${e[titleField.id]}${badge ? ` [${badge.split(' · ')[0]}]` : ''}` });
            for (const f of b.fields) {
              if (f.role === 'title' || f.role === 'badge') continue;
              if (nonEmpty(e[f.id])) body.push({ t: 'p', text: `${f.label}: ${e[f.id]}` });
            }
          }
        } else if (b.type === 'images') {
          if (imageNames.length) {
            body.push({ t: 'h3', text: md.images });
            body.push({ t: 'list', items: imageNames.map((n) => ({ text: n })) });
          }
        } else if (b.type === 'columns') {
          for (const col of b.columns) walk(col.blocks, col.title);
        } else if (b.type === 'slot') {
          walk(pack?.slots?.[b.name], heading);
        }
      }
    };
    walk(step.blocks);
    if (body.length) nodes.push({ t: 'h2', text: tpl(step.short, lesson) }, ...body);
  }
  return nodes;
}

export function buildOutlineDoc(content, getLessonInfo, stamp) {
  const ui = content.ui;
  const c = content.curriculum;
  const md = ui.export.md;
  const nodes = [{ t: 'h1', text: md.outlineTitle }, { t: 'front', pairs: [[md.exportedOn, stamp]] }];

  nodes.push({ t: 'h2', text: c.loop.title }, { t: 'p', text: c.loop.intro });
  nodes.push({ t: 'list', ordered: true, items: c.loop.stages.map((s) => ({ text: `${s.name} — ${s.title}: ${s.text}` })) });

  nodes.push({ t: 'h2', text: c.layers.title });
  for (const layer of c.layers.items) {
    nodes.push({ t: 'h3', text: `${layer.name} — ${layer.title}` }, { t: 'list', items: layer.points.map((p) => ({ text: p })) });
  }

  nodes.push({ t: 'h2', text: c.curriculum.title }, { t: 'p', text: c.curriculum.intro });
  for (const track of c.curriculum.tracks) {
    nodes.push({ t: 'h3', text: `${track.name} — ${track.title}` });
    if (track.note) nodes.push({ t: 'p', text: track.note });
    nodes.push({
      t: 'list',
      items: track.lessons.map((l) => {
        const info = getLessonInfo(l.id);
        const note = l.note ? ` (${l.note})` : '';
        return { text: `${l.title}${note} — ${info.label}`, checked: info.done };
      }),
    });
  }

  nodes.push({ t: 'h2', text: c.roadmap.title }, { t: 'p', text: c.roadmap.intro });
  for (const phase of c.roadmap.phases) {
    nodes.push({ t: 'h3', text: phase.title }, { t: 'list', items: phase.points.map((p) => ({ text: p })) });
  }
  return nodes;
}

export function combineDocs(title, stamp, md, docs) {
  const out = [{ t: 'h1', text: title }, { t: 'front', pairs: [[md.exportedOn, stamp]] }];
  for (const doc of docs) {
    for (const n of doc) {
      if (n.t === 'front') continue;
      out.push(n.t === 'h1' ? { ...n, t: 'h2', rule: true } : n.t === 'h2' ? { ...n, t: 'h3' } : n.t === 'h3' ? { ...n, t: 'h4' } : n);
    }
  }
  return out;
}

/* ------------------------------------------------------------ serialisers */

export function docToMarkdown(nodes) {
  const lines = [];
  const prefix = { h1: '#', h2: '##', h3: '###', h4: '####' };
  nodes.forEach((n) => {
    if (n.t in prefix) {
      if (n.rule) lines.push('---', '');
      lines.push(`${prefix[n.t]} ${n.text}`, '');
    } else if (n.t === 'front') {
      lines.push('---', ...n.pairs.map(([k, v]) => `${k}: ${String(v).replace(/\n/g, ' ')}`), '---', '');
    } else if (n.t === 'p') {
      lines.push(n.strong ? `**${n.text}**` : n.text, '');
    } else if (n.t === 'list') {
      n.items.forEach((item, i) => {
        const mark = n.ordered ? `${i + 1}.` : '-';
        const box = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
        lines.push(`${mark} ${box}${item.text}`);
      });
      lines.push('');
    }
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function docToDom(nodes) {
  const root = h('article', { class: 'report' });
  nodes.forEach((n) => {
    if (n.t === 'h1') root.append(h('h1', {}, n.text));
    else if (n.t === 'h2') root.append(h('h2', {}, n.text));
    else if (n.t === 'h3') root.append(h('h3', {}, n.text));
    else if (n.t === 'h4') root.append(h('h4', {}, n.text));
    else if (n.t === 'front') {
      root.append(h('dl', {}, n.pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    } else if (n.t === 'p') root.append(h('p', {}, n.strong ? h('strong', {}, n.text) : n.text));
    else if (n.t === 'list') {
      root.append(h(n.ordered ? 'ol' : 'ul', {}, n.items.map((i) => h('li', {}, i.checked === undefined ? '' : i.checked ? '☑ ' : '☐ ', i.text))));
    }
  });
  return root;
}
