// Loads the content bundle (all human-readable text lives in /content/<lang>/*.json).

const FILES = ['ui', 'curriculum', 'flows', 'library', 'prompts'];

export const DEFAULT_LANG = 'fa';

export async function loadContent(lang = DEFAULT_LANG) {
  const parts = await Promise.all(
    FILES.map(async (name) => {
      const res = await fetch(`content/${lang}/${name}.json`);
      if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
      return res.json();
    }),
  );
  const content = Object.fromEntries(FILES.map((n, i) => [n, parts[i]]));
  return index(content);
}

function index(content) {
  const lessons = new Map();
  const ordered = [];
  for (const track of content.curriculum.curriculum.tracks) {
    track.lessons.forEach((lesson, i) => {
      const entry = {
        ...lesson,
        track,
        number: i + 1,
        code: `FC-${track.code}-${String(i + 1).padStart(2, '0')}`,
        flow: lesson.flow || 'standard',
        english: lesson.english || lesson.title,
      };
      lessons.set(lesson.id, entry);
      ordered.push(entry);
    });
  }
  content.lessons = lessons;
  content.lessonList = ordered;
  return content;
}

/** Resolve "pack:key" / "shared:key" references against the lesson's library pack. */
export function resolveSource(content, lesson, ref) {
  const [scope, key] = String(ref).split(':');
  if (scope === 'shared') return content.library.shared[key] ?? null;
  const pack = lesson?.pack ? content.library.packs[lesson.pack] : null;
  return pack ? pack[key] ?? null : null;
}

export function getPack(content, lesson) {
  return lesson?.pack ? content.library.packs[lesson.pack] ?? null : null;
}

/** Replace {lesson.*}, {track.*} and {today} tokens in content strings. */
export function tpl(text, lesson, today) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\{lesson\.title\}/g, lesson?.title ?? '')
    .replace(/\{lesson\.code\}/g, lesson?.code ?? '')
    .replace(/\{lesson\.english\}/g, lesson?.english ?? lesson?.title ?? '')
    .replace(/\{track\.title\}/g, lesson?.track?.title ?? '')
    .replace(/\{track\.name\}/g, lesson?.track?.name ?? '')
    .replace(/\{today\}/g, today ?? '');
}
