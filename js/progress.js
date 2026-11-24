// Derived state: which steps have content, lesson progress, status, field defaults.

import { getPack, tpl } from './content.js';
import { todayIso } from './util.js';

export function stepsOf(content, lesson) {
  return content.flows.flows[lesson.flow].map((id) => ({ id, ...content.flows.steps[id] }));
}

/** Walk a block tree and call visit(block) for every block, including nested columns. */
export function walkBlocks(blocks, visit, pack) {
  for (const block of blocks || []) {
    visit(block);
    if (block.type === 'columns') block.columns.forEach((c) => walkBlocks(c.blocks, visit, pack));
    if (block.type === 'slot' && pack?.slots?.[block.name]) walkBlocks(pack.slots[block.name], visit, pack);
  }
}

export function fieldDefault(content, lesson, field) {
  const pack = getPack(content, lesson);
  const packDefault = pack?.defaults?.fields?.[field.id];
  const raw = packDefault ?? field.default;
  if (raw !== undefined) return tpl(raw, lesson, todayIso());
  if (field.kind === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

export function fieldValue(content, lesson, field, data) {
  const stored = data.fields[field.id];
  return stored !== undefined ? stored : fieldDefault(content, lesson, field);
}

export function picksValue(content, lesson, block, data) {
  const stored = data.picks[block.id];
  if (stored) return stored;
  return getPack(content, lesson)?.defaults?.picks?.[block.id] ?? [];
}

export function stepTouched(content, lesson, step, data) {
  let touched = false;
  walkBlocks(step.blocks, (b) => {
    if (touched) return;
    if (b.type === 'fields') touched = b.fields.some((f) => (data.fields[f.id] ?? '') !== '');
    else if (b.type === 'picker') touched = Boolean(data.picks[b.id]?.length);
    else if (b.type === 'checklist') touched = Boolean(data.checks[b.id]?.length);
    else if (b.type === 'log') touched = Boolean(data.logs[b.id]?.length);
    else if (b.type === 'images') touched = data.imageCount > 0;
  }, getPack(content, lesson));
  return touched;
}

export function lessonProgress(content, lesson, data) {
  const steps = stepsOf(content, lesson);
  const done = steps.filter((s) => stepTouched(content, lesson, s, data)).length;
  return { done, total: steps.length, ratio: steps.length ? done / steps.length : 0 };
}

/** none | researching | ready | needs-data | stopped */
export function lessonStatus(progress, data) {
  const chosen = data.fields['final.status'];
  if (chosen && chosen !== 'researching') return chosen;
  return progress.done > 0 ? 'researching' : 'none';
}

export function optionLabel(field, value) {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}
