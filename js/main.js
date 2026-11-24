// Application bootstrap: shell, router, exports, theme, PWA hooks.

import { DEFAULT_LANG, loadContent } from './content.js';
import { buildLessonDoc, buildOutlineDoc, combineDocs, docToDom, docToMarkdown } from './doc.js';
import { icon } from './icons.js';
import { lessonProgress } from './progress.js';
import { images, store } from './store.js';
import { clear, download, h, qs, shareFile, toast, todayIso } from './util.js';
import { deskEmpty, deskView, exportView, homeView, lessonInfo, toolsView } from './views.js';

const NAV = [
  { id: 'outline', hash: '#/', icon: 'outline', match: (r) => r === 'home' },
  { id: 'desk', hash: '#/desk', icon: 'desk', match: (r) => r === 'desk' },
  { id: 'tools', hash: '#/tools', icon: 'tools', match: (r) => r === 'tools' },
  { id: 'export', hash: '#/export', icon: 'export', match: (r) => r === 'export' },
];

let installEvent = null;
const installListeners = [];
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installListeners.splice(0).forEach((fn) => fn());
});

async function boot() {
  let content;
  try {
    content = await loadContent(DEFAULT_LANG);
  } catch (err) {
    qs('#app').textContent = `Failed to load content: ${err.message}`;
    return;
  }
  const { ui } = content;
  document.documentElement.lang = ui.meta.lang;
  document.documentElement.dir = ui.meta.dir;
  document.title = ui.meta.documentTitle;
  qs('meta[name="description"]')?.setAttribute('content', ui.meta.description);

  const app = makeApp(content);
  buildShell(app);
  applyTheme();
  applyScale();
  window.addEventListener('hashchange', () => route(app));
  window.addEventListener('fc:storage-error', () => toast(ui.export.storageFull));
  route(app);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ------------------------------------------------------------------ theme */

function applyTheme() {
  const t = store.ui.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  qs('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101517' : '#f5f0e6');
}

function applyScale() {
  document.documentElement.style.fontSize = `${Math.round(store.ui.scale * 100)}%`;
}

/* -------------------------------------------------------------------- app */

function makeApp(content) {
  const stamp = () => todayIso();
  const lessonFile = (l) => `${l.code.toLowerCase()}-${l.id}.md`;

  async function lessonDoc(lesson) {
    let names = [];
    try { names = (await images.list(lesson.id)).map((i) => i.name); } catch { names = []; }
    return buildLessonDoc(content, lesson, store.peek(lesson.id), names, stamp());
  }

  const app = {
    content,
    setTheme(value) { store.setUi({ theme: value }); applyTheme(); },
    setScale(value) { store.setUi({ scale: value }); applyScale(); },
    canInstall: () => Boolean(installEvent),
    onInstallable: (fn) => installListeners.push(fn),
    async install() {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
    },

    async downloadLesson(lesson) {
      download(lessonFile(lesson), docToMarkdown(await lessonDoc(lesson)));
    },
    async shareLesson(lesson) {
      const text = docToMarkdown(await lessonDoc(lesson));
      if (!(await shareFile(lessonFile(lesson), text))) download(lessonFile(lesson), text);
    },
    async printLesson(lesson) {
      const root = qs('#print-root');
      clear(root).append(docToDom(await lessonDoc(lesson)));
      window.addEventListener('afterprint', () => clear(root), { once: true });
      window.print();
    },
    async downloadAll() {
      const started = content.lessonList.filter((l) => lessonProgress(content, l, store.peek(l.id)).done > 0);
      if (!started.length) { toast(content.ui.export.noResearch); return; }
      const docs = await Promise.all(started.map(lessonDoc));
      const md = combineDocs(content.ui.export.md.allTitle, stamp(), content.ui.export.md, docs);
      download('finance-city-research.md', docToMarkdown(md));
    },
    downloadOutline() {
      const doc = buildOutlineDoc(content, (id) => lessonInfo(app, content.lessons.get(id)), stamp());
      download('finance-city-outline.md', docToMarkdown(doc));
    },
    downloadBackup() {
      download(`finance-city-backup-${stamp()}.json`, store.exportJson(), 'application/json');
    },
  };
  return app;
}

/* ------------------------------------------------------------------ shell */

function buildShell(app) {
  const { ui } = app.content;
  const brand = () => h('a', { class: 'brand', href: '#/' },
    h('span', { class: 'logo', 'aria-hidden': 'true' }, 'FC'),
    h('span', { class: 'brand-text' }, h('strong', {}, ui.meta.appName), h('small', {}, ui.meta.appSubtitle)));

  const navLinks = (cls) => h('nav', { class: cls, 'aria-label': 'main' }, NAV.map((n) =>
    h('a', { href: n.hash, dataset: { nav: n.id } }, icon(n.icon), h('span', {}, ui.nav[n.id]))));

  const themeBtn = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': ui.export.theme,
    onclick: () => {
      const dark = document.documentElement.dataset.theme === 'dark'
        || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      app.setTheme(dark ? 'light' : 'dark');
    },
  }, icon('sun'));

  const root = qs('#app');
  clear(root).append(
    h('aside', { class: 'rail' }, brand(), navLinks('rail-nav'), h('p', { class: 'rail-foot muted small' }, ui.footer.privacy)),
    h('div', { class: 'main-col' },
      h('header', { class: 'masthead' }, brand(), themeBtn),
      h('main', { id: 'view', tabindex: '-1' }),
      h('footer', { class: 'site-foot muted small' }, ui.meta.creditLine)),
    navLinks('tabbar'),
    h('div', { id: 'print-root' }));
}

/* ----------------------------------------------------------------- router */

let current = null;

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, a, b] = parts;
  if (!head) return { name: 'home' };
  if (head === 'desk') return { name: 'desk', id: a, step: b };
  if (head === 'tools') return { name: 'tools' };
  if (head === 'export') return { name: 'export' };
  return { name: 'home' };
}

function route(app) {
  const r = parse();
  if (r.name === 'desk' && !r.id && store.ui.lastLesson && app.content.lessons.has(store.ui.lastLesson)) {
    location.replace(`#/desk/${store.ui.lastLesson}/${store.ui.lastStep[store.ui.lastLesson] || 0}`);
    return;
  }
  current?.destroy?.();
  const view = qs('#view');
  const next = r.name === 'desk'
    ? (r.id ? deskView(app, r.id, r.step) : deskEmpty(app))
    : r.name === 'tools' ? toolsView(app)
      : r.name === 'export' ? exportView(app)
        : homeView(app);
  next.key = `${r.name}:${r.id}`;
  clear(view).append(next.el);
  current = next;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const item = NAV.find((n) => n.id === a.dataset.nav);
    const on = item.match(r.name === 'home' ? 'home' : r.name);
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

boot();
