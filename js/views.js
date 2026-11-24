// Page views: outline (home), desk (workspace), tools (AI helper), export.

import { askModel, buildPrompt } from './ai.js';
import { renderBlocks } from './blocks.js';
import { tpl } from './content.js';
import { icon } from './icons.js';
import { lessonProgress, lessonStatus, stepTouched, stepsOf } from './progress.js';
import { store } from './store.js';
import { clear, copyText, fmt, h, toast } from './util.js';

const nf = (app) => new Intl.NumberFormat(app.content.ui.meta.locale);
const pct = (app, ratio) => new Intl.NumberFormat(app.content.ui.meta.locale, { style: 'percent' }).format(ratio);
const pad2 = (app, n) => new Intl.NumberFormat(app.content.ui.meta.locale, { minimumIntegerDigits: 2, useGrouping: false }).format(n);

export function lessonInfo(app, lesson) {
  const data = store.peek(lesson.id);
  const progress = lessonProgress(app.content, lesson, data);
  const status = lessonStatus(progress, data);
  return { progress, status, label: app.content.ui.status[status], done: status === 'ready' };
}

function progressBar(ratio) {
  return h('span', { class: 'meter', role: 'presentation' }, h('i', { style: `width:${Math.round(ratio * 100)}%` }));
}

function statusPill(app, status) {
  return h('span', { class: `pill status-${status}` }, app.content.ui.status[status]);
}

function sectionHead(kicker, title, text) {
  return h('header', { class: 'section-head' },
    h('span', { class: 'kicker' }, kicker),
    h('h2', {}, title),
    text ? h('p', { class: 'lede' }, text) : null);
}

/* ------------------------------------------------------------------- home */

export function homeView(app) {
  const { ui, curriculum: c } = app.content;
  const t = ui.home;
  const root = h('div', { class: 'view home' });

  // Hero
  const last = store.ui.lastLesson && app.content.lessons.get(store.ui.lastLesson);
  const first = app.content.lessonList[0];
  const target = last || first;
  const info = last ? lessonInfo(app, last) : null;
  const heroCard = h('a', { class: 'continue', href: `#/desk/${target.id}/${last ? store.ui.lastStep[last.id] || 0 : 0}` },
    h('span', { class: 'kicker' }, last ? t.continue : t.startFirst),
    h('strong', {}, target.title),
    info ? h('span', { class: 'continue-meta' }, progressBar(info.progress.ratio), statusPill(app, info.status)) : null,
    h('span', { class: 'go' }, icon('arrow', 20)));

  root.append(h('header', { class: 'hero' },
    h('div', { class: 'hero-copy' },
      h('span', { class: 'kicker' }, t.kicker),
      h('h1', {}, t.headline),
      h('p', { class: 'lede' }, t.lede)),
    heroCard));

  const anchors = h('nav', { class: 'anchors', 'aria-label': 'sections' },
    Object.entries(t.sections).map(([id, label]) =>
      h('button', { type: 'button', class: 'chip', onclick: () => document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, label)));
  root.append(anchors);

  // Learning loop
  const loop = h('section', { id: 's-loop', class: 'block' },
    sectionHead(pad2(app, 1), c.loop.title, c.loop.intro),
    h('ol', { class: 'loop' }, c.loop.stages.map((s, i) =>
      h('li', {},
        h('span', { class: 'n' }, pad2(app, i + 1)),
        h('strong', { class: 'en' }, s.name),
        h('span', { class: 'fa' }, s.title),
        h('p', {}, s.text)))),
    h('p', { class: 'loop-return' }, `↺ ${t.loopReturn}`),
    h('p', { class: 'muted note' }, c.loop.note));
  root.append(loop);

  // Layers
  root.append(h('section', { id: 's-layers', class: 'block' },
    sectionHead(pad2(app, 2), c.layers.title),
    h('div', { class: 'layers' }, c.layers.items.map((l, i) =>
      h('article', { class: 'layer' },
        h('span', { class: 'n' }, pad2(app, i + 1)),
        h('h3', {}, h('span', { class: 'en' }, l.name), h('span', { class: 'fa' }, l.title)),
        h('ul', { class: 'plain-list' }, l.points.map((p) => h('li', {}, p))))))));

  // Curriculum
  const curriculumBox = h('div', { class: 'tracks' });
  const search = h('input', { type: 'search', class: 'search', placeholder: t.search, 'aria-label': t.search });
  const drawTracks = () => {
    clear(curriculumBox);
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const track of c.curriculum.tracks) {
      const lessons = track.lessons
        .map((l) => app.content.lessons.get(l.id))
        .filter((l) => !q || `${l.title} ${l.note || ''} ${l.english} ${track.name} ${track.title}`.toLowerCase().includes(q));
      if (!lessons.length) continue;
      shown += lessons.length;
      const doneCount = lessons.filter((l) => lessonInfo(app, l).done).length;
      curriculumBox.append(h('section', { class: 'track' },
        h('header', {},
          h('span', { class: 'code' }, track.code),
          h('h3', {}, h('span', { class: 'en' }, track.name), h('span', { class: 'fa' }, track.title)),
          h('span', { class: 'muted small' },
            fmt(t.lessonsCount, { n: nf(app).format(track.lessons.length) }),
            doneCount ? ` · ${fmt(t.doneCount, { n: nf(app).format(doneCount) })}` : '')),
        track.note ? h('p', { class: 'muted small track-note' }, track.note) : null,
        h('ol', { class: 'lessons' }, lessons.map((l) => {
          const info = lessonInfo(app, l);
          return h('li', {},
            h('a', { class: 'lesson', href: `#/desk/${l.id}/${store.ui.lastStep[l.id] || 0}` },
              h('span', { class: 'n' }, pad2(app, l.number)),
              h('span', { class: 'lesson-body' },
                h('strong', {}, l.title),
                l.note ? h('span', { class: 'muted small' }, ` (${l.note})`) : null),
              info.status === 'none' ? null : h('span', { class: 'lesson-state' }, progressBar(info.progress.ratio), statusPill(app, info.status)),
              h('span', { class: 'go' }, icon('arrow', 18))));
        }))));
    }
    if (!shown) curriculumBox.append(h('p', { class: 'muted' }, t.noResults));
  };
  search.addEventListener('input', drawTracks);
  drawTracks();
  root.append(h('section', { id: 's-curriculum', class: 'block' },
    sectionHead(pad2(app, 3), c.curriculum.title, c.curriculum.intro),
    search,
    curriculumBox));

  // Roadmap
  root.append(h('section', { id: 's-roadmap', class: 'block' },
    sectionHead(pad2(app, 4), c.roadmap.title, c.roadmap.intro),
    h('div', { class: 'phases' }, c.roadmap.phases.map((p, i) =>
      h('article', { class: 'phase' },
        h('span', { class: 'n' }, `P${nf(app).format(i + 1)}`),
        h('h3', {}, p.title.replace(/^[^—]*—\s*/, '')),
        h('ul', { class: 'plain-list' }, p.points.map((x) => h('li', {}, x))))))));

  root.append(h('aside', { class: 'callout' }, h('strong', { class: 'callout-title' }, t.ruleTitle), h('p', {}, t.rule)));
  return { el: root, destroy() {} };
}

/* ------------------------------------------------------------------- desk */

export function deskView(app, lessonId, stepParam) {
  const { ui } = app.content;
  const d = ui.desk;
  const lesson = app.content.lessons.get(lessonId);
  if (!lesson) {
    return { el: h('div', { class: 'view empty' }, h('p', {}, d.lessonNotFound), h('a', { class: 'btn', href: '#/' }, d.openOutline)), destroy() {} };
  }
  const steps = stepsOf(app.content, lesson);
  const index = Math.max(0, Math.min(steps.length - 1, Number.parseInt(stepParam, 10) || 0));
  const step = steps[index];
  store.rememberStep(lesson.id, index);

  const ctx = {
    content: app.content,
    lesson,
    actions: {
      'download-md': () => app.downloadLesson(lesson),
      'share-md': () => app.shareLesson(lesson),
      print: () => app.printLesson(lesson),
    },
  };

  const root = h('div', { class: 'view desk' });
  const metaBar = h('div', { class: 'desk-meta' });
  const drawMeta = () => {
    const info = lessonInfo(app, lesson);
    clear(metaBar);
    metaBar.append(
      h('span', { class: 'meta-label' }, `${d.progress} ${pct(app, info.progress.ratio)}`),
      progressBar(info.progress.ratio),
      statusPill(app, info.status));
  };
  drawMeta();

  root.append(h('header', { class: 'desk-head' },
    h('a', { class: 'crumb', href: '#/' }, `← ${d.backToOutline}`),
    h('span', { class: 'kicker' }, `${lesson.track.name} · ${lesson.code}`),
    h('h1', {}, lesson.title, lesson.note ? h('small', {}, ` (${lesson.note})`) : null),
    metaBar));

  // Stepper (sidebar on desktop, sheet on mobile)
  const stepper = h('nav', { class: 'stepper', 'aria-label': d.steps });
  const drawStepper = () => {
    clear(stepper);
    stepper.append(h('div', { class: 'stepper-head' },
      h('strong', {}, d.steps),
      h('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': d.closeSheet, onclick: () => root.classList.remove('sheet-open') }, icon('close'))));
    const list = h('ol', {});
    steps.forEach((s, i) => {
      const touched = stepTouched(app.content, lesson, s, store.peek(lesson.id));
      list.append(h('li', {},
        h('a', {
          href: `#/desk/${lesson.id}/${i}`,
          class: `${i === index ? 'active' : ''}${touched ? ' touched' : ''}`,
          'aria-current': i === index ? 'step' : null,
          onclick: () => root.classList.remove('sheet-open'),
        }, h('span', { class: 'n' }, touched && i !== index ? icon('check', 14) : pad2(app, i + 1)), h('span', {}, s.short))));
    });
    stepper.append(list);
  };
  drawStepper();

  const sheetBtn = h('button', {
    type: 'button',
    class: 'sheet-trigger',
    onclick: () => root.classList.add('sheet-open'),
  }, icon('steps', 18), h('span', {}, `${fmt(d.stepOf, { n: nf(app).format(index + 1), total: nf(app).format(steps.length) })} · ${step.short}`));

  // Step article
  const article = h('article', { class: 'step' },
    h('header', { class: 'step-head' },
      h('span', { class: 'step-num' }, pad2(app, index + 1)),
      h('div', {},
        h('span', { class: 'kicker' }, tpl(step.eyebrow, lesson)),
        h('h2', {}, tpl(step.title, lesson)),
        step.intro ? h('p', { class: 'lede' }, tpl(step.intro, lesson)) : null)),
    renderBlocks(step.blocks, ctx));

  const prev = steps[index - 1];
  const next = steps[index + 1];
  article.append(h('footer', { class: 'pager' },
    prev ? h('a', { class: 'btn', href: `#/desk/${lesson.id}/${index - 1}` }, `→ ${d.prev}`) : h('span'),
    next
      ? h('a', { class: 'btn primary', href: `#/desk/${lesson.id}/${index + 1}` }, `${d.next}: ${next.short} ←`)
      : h('a', { class: 'btn primary', href: '#/' }, d.finish)));

  root.append(sheetBtn, h('div', { class: 'desk-grid' }, stepper, article),
    h('div', { class: 'sheet-backdrop', onclick: () => root.classList.remove('sheet-open') }));

  const unsub = store.subscribe(() => { drawMeta(); drawStepper(); });
  return { el: root, destroy: unsub };
}

export function deskEmpty(app) {
  const d = app.content.ui.desk;
  return { el: h('div', { class: 'view empty' }, h('span', { class: 'kicker' }, app.content.ui.nav.desk), h('h1', {}, d.title), h('p', { class: 'lede' }, d.empty), h('a', { class: 'btn primary', href: '#/' }, d.openOutline)), destroy() {} };
}

/* ------------------------------------------------------------------ tools */

export function toolsView(app) {
  const { ui, prompts } = app.content;
  const t = ui.tools;
  const root = h('div', { class: 'view tools' });
  const activeLesson = store.ui.lastLesson && app.content.lessons.get(store.ui.lastLesson);

  const task = h('select', { id: 'ai-task' }, prompts.tasks.map((x) => h('option', { value: x.id }, x.label)));
  const input = h('textarea', { rows: 5, id: 'ai-input', placeholder: t.inputPlaceholder });
  const promptOut = h('textarea', { rows: 12, id: 'ai-prompt', placeholder: t.promptOutPlaceholder });
  const build = () => {
    promptOut.value = buildPrompt(prompts, task.value, input.value, activeLesson?.title);
  };

  const endpoint = h('input', { type: 'url', id: 'ai-endpoint', value: 'http://localhost:1234/v1/chat/completions', dir: 'ltr' });
  const model = h('input', { type: 'text', id: 'ai-model', value: 'local-model', dir: 'ltr' });
  const key = h('input', { type: 'password', id: 'ai-key', autocomplete: 'off', dir: 'ltr' });
  const agentOut = h('textarea', { rows: 12, id: 'ai-out' });

  const field = (label, el, id) => h('div', { class: 'field' }, h('label', { for: id }, label), el);

  root.append(
    h('header', { class: 'page-head' }, h('span', { class: 'kicker' }, ui.nav.tools), h('h1', {}, t.title), h('p', { class: 'lede' }, t.lede)),
    h('div', { class: 'columns' },
      h('section', { class: 'card' },
        h('h3', {}, t.promptTitle),
        h('p', { class: 'muted' }, t.promptText),
        activeLesson ? h('p', { class: 'context' }, h('b', {}, `${t.lessonContext}: `), activeLesson.title) : null,
        field(t.task, task, 'ai-task'),
        field(t.input, input, 'ai-input'),
        h('div', { class: 'actions' },
          activeLesson ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { input.value = activeLesson.title; } }, t.useLesson) : null,
          h('button', { type: 'button', class: 'btn primary', onclick: build }, t.build),
          h('button', {
            type: 'button',
            class: 'btn',
            onclick: async () => {
              if (!promptOut.value) { toast(t.needPrompt); return; }
              toast((await copyText(promptOut.value)) ? app.content.ui.blocks.copied : '');
            },
          }, t.copyPrompt)),
        field(t.promptOut, promptOut, 'ai-prompt')),
      h('section', { class: 'card' },
        h('h3', {}, t.agentTitle),
        h('p', { class: 'muted' }, t.agentText),
        field(t.endpoint, endpoint, 'ai-endpoint'),
        field(t.model, model, 'ai-model'),
        field(t.key, key, 'ai-key'),
        h('div', { class: 'actions' },
          h('button', {
            type: 'button',
            class: 'btn primary',
            onclick: async () => {
              if (!endpoint.value.trim()) { toast(t.needEndpoint); return; }
              build();
              agentOut.value = t.sending;
              try {
                agentOut.value = await askModel({ endpoint: endpoint.value.trim(), model: model.value.trim(), key: key.value.trim(), prompt: promptOut.value });
              } catch (err) {
                agentOut.value = fmt(t.error, { message: err.message });
              }
            },
          }, t.run)),
        field(t.agentOut, agentOut, 'ai-out'),
        h('button', {
          type: 'button',
          class: 'btn',
          onclick: () => {
            if (!activeLesson) { toast(t.needLesson); return; }
            const body = agentOut.value.trim();
            if (!body) return;
            const taskLabel = prompts.tasks.find((x) => x.id === task.value)?.label || '';
            store.addLog(activeLesson.id, 'notes', { type: 'ai-draft', source: t.aiNoteSource, title: taskLabel, body, relevance: t.aiNoteRelevance });
            toast(t.savedAsNote);
          },
        }, t.saveAsNote))),
    h('section', { class: 'card' }, h('h3', {}, t.standardTitle), h('ol', { class: 'plain-list' }, t.standard.map((x) => h('li', {}, x)))),
    h('aside', { class: 'callout' }, h('strong', { class: 'callout-title' }, t.securityTitle), h('p', {}, t.security)));
  return { el: root, destroy() {} };
}

/* ----------------------------------------------------------------- export */

export function exportView(app) {
  const { ui } = app.content;
  const t = ui.export;
  const root = h('div', { class: 'view export' });

  const researchList = h('ul', { class: 'export-list' });
  const drawList = () => {
    clear(researchList);
    const started = app.content.lessonList.filter((l) => lessonInfo(app, l).progress.done > 0);
    if (!started.length) { researchList.append(h('li', { class: 'muted' }, t.noResearch)); return; }
    started.forEach((l) => {
      const info = lessonInfo(app, l);
      researchList.append(h('li', {},
        h('span', {}, h('strong', {}, l.title), h('span', { class: 'muted small' }, ` · ${l.code} · ${info.label}`)),
        h('span', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: () => app.downloadLesson(l) }, '.md'),
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => app.shareLesson(l) }, ui.blocks.share))));
    });
  };
  drawList();

  const restoreInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    if (!window.confirm(t.restoreConfirm)) { restoreInput.value = ''; return; }
    try {
      store.importJson(await file.text());
      toast(t.restoreOk);
      drawList();
    } catch {
      toast(t.restoreBad);
    }
    restoreInput.value = '';
  });

  const themeSelect = h('select', { id: 'theme-select' }, [['auto', t.themeAuto], ['light', t.themeLight], ['dark', t.themeDark]].map(([v, l]) => h('option', { value: v }, l)));
  themeSelect.value = store.ui.theme;
  themeSelect.addEventListener('change', () => app.setTheme(themeSelect.value));
  const scale = h('input', { type: 'range', id: 'scale-range', min: '0.85', max: '1.3', step: '0.05', value: String(store.ui.scale) });
  scale.addEventListener('input', () => app.setScale(Number(scale.value)));

  const installBtn = h('button', { type: 'button', class: 'btn', hidden: !app.canInstall(), onclick: () => app.install() }, t.installButton);
  app.onInstallable(() => { installBtn.hidden = false; });

  root.append(
    h('header', { class: 'page-head' }, h('span', { class: 'kicker' }, ui.nav.export), h('h1', {}, t.title), h('p', { class: 'lede' }, t.lede)),
    h('div', { class: 'columns' },
      h('section', { class: 'card' }, h('h3', {}, t.outlineTitle), h('p', { class: 'muted' }, t.outlineText),
        h('button', { type: 'button', class: 'btn primary', onclick: () => app.downloadOutline() }, t.outlineButton)),
      h('section', { class: 'card' }, h('h3', {}, t.researchTitle), h('p', { class: 'muted' }, t.researchText),
        researchList,
        h('button', { type: 'button', class: 'btn primary', onclick: () => app.downloadAll() }, t.allButton))),
    h('div', { class: 'columns' },
      h('section', { class: 'card' }, h('h3', {}, t.backupTitle), h('p', { class: 'muted' }, t.backupText),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => app.downloadBackup() }, t.backupButton),
          h('button', { type: 'button', class: 'btn', onclick: () => restoreInput.click() }, t.restoreButton),
          restoreInput)),
      h('section', { class: 'card' }, h('h3', {}, t.displayTitle),
        h('div', { class: 'field' }, h('label', { for: 'theme-select' }, t.theme), themeSelect),
        h('div', { class: 'field' }, h('label', { for: 'scale-range' }, t.textSize), scale))),
    h('div', { class: 'columns' },
      h('section', { class: 'card' }, h('h3', {}, t.installTitle), h('p', { class: 'muted' }, t.install), installBtn),
      h('section', { class: 'card danger-zone' }, h('h3', {}, t.dangerTitle),
        h('button', {
          type: 'button',
          class: 'btn danger',
          onclick: async () => {
            if (!window.confirm(t.wipeConfirm)) return;
            await store.wipe();
            toast(t.wiped);
            drawList();
          },
        }, t.wipeButton))),
    h('p', { class: 'credit muted small' }, ui.meta.creditLine));
  return { el: root, destroy() {} };
}
