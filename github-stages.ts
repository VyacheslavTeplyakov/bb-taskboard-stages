import { z } from 'zod';

export const stageLabelSchema = z.string().trim().max(50)
  .regex(/^stage:[a-z0-9][a-z0-9._-]*$/u, 'Use a stage: label with a stable lowercase identifier');
export const stageColumnSchema = z.object({
  label: stageLabelSchema,
  name: z.string().trim().min(1).max(80)
}).strict();
export type StageColumn = z.infer<typeof stageColumnSchema>;
export const stageColumnsSchema = z.array(stageColumnSchema).max(50).superRefine((columns, ctx) => {
  if (new Set(columns.map(c => c.label)).size !== columns.length) {
    ctx.addIssue({ code: 'custom', message: 'Each stage label must have exactly one column' });
  }
  if (new Set(columns.map(c => c.name.toLowerCase())).size !== columns.length) {
    ctx.addIssue({ code: 'custom', message: 'Column names must be unique' });
  }
});
export const stageProfileSchema = z.object({
  projectId: z.string().startsWith('proj_').max(500),
  revision: z.number().int().nonnegative(),
  columns: stageColumnsSchema
}).strict();
export type StageProfile = z.infer<typeof stageProfileSchema>;

export const DEFAULT_STAGE_COLUMNS: StageColumn[] = [
  { label: 'stage:backlog', name: 'Очередь' },
  { label: 'stage:specification', name: 'Постановка' },
  { label: 'stage:development', name: 'Разработка' },
  { label: 'stage:review', name: 'Ревью' },
  { label: 'stage:release', name: 'Публикация' },
  { label: 'stage:acceptance', name: 'Приёмка' },
  { label: 'stage:done', name: 'Завершено' }
];
export const stageInfoSchema = z.object({
  kind: z.enum(['assigned', 'unassigned', 'invalid']),
  label: z.string().nullable(),
  name: z.string(),
  labels: z.array(z.string()),
  reason: z.string().nullable()
}).strict();
export type StageInfo = z.infer<typeof stageInfoSchema>;

export function stageLabels(labels: readonly string[]): string[] {
  return labels.filter(l => l.toLowerCase().startsWith('stage:')).sort((a, b) => a.localeCompare(b));
}
export function sameStageLabels(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => values.map(v => v.toLowerCase()).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
export function classifyStage(labels: readonly string[], columns: readonly StageColumn[]): StageInfo {
  const stages = stageLabels(labels);
  if (stages.length === 0) return { kind: 'unassigned', label: null, name: 'Без этапа', labels: stages, reason: null };
  if (stages.length === 1) {
    const column = columns.find(c => c.label === stages[0]!.toLowerCase());
    if (column) return { kind: 'assigned', label: column.label, name: column.name, labels: stages, reason: null };
  }
  return { kind: 'invalid', label: null, name: 'Требует настройки', labels: stages,
    reason: stages.length > 1 ? 'У задачи несколько меток этапа' : 'Метка этапа отсутствует в профиле проекта' };
}

/** Only stage data is projected; the issue's native status is never overwritten. */
export function stageLaneKey(stage: StageInfo): string {
  return stage.kind === 'assigned' ? stage.label! : `__${stage.kind}__`;
}
