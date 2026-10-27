import type { BbPluginApi, PluginRpcHandlers } from '@get-bb/plugin-sdk';
import { createHash } from 'node:crypto';
import { classifyStage, stageProfileSchema, stageLabels, type StageProfile } from './github-stages.ts';
import type { StageRpcContract, WorkItem, WorkItemDetail } from './contract.js';
import type { WorkSourceAdapter } from './sources/types.js';

interface StageDependencies {
  assertProject(projectId: string): Promise<void>;
  assertGithub(projectId: string): void;
  adapter(projectId: string): Promise<WorkSourceAdapter>;
  list(projectId: string, limit: number, offset: number): WorkItem[];
  syncState(projectId: string): { lastSyncedAt: string | null; error: string | null };
  revision(projectId: string): number | string;
  persist(item: WorkItem): void;
  mutate<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

export function createStageFeature(bb: BbPluginApi, deps: StageDependencies) {
  const key = (projectId: string) => `github-stage-profile:${projectId}`;
  async function profile(projectId: string): Promise<StageProfile> {
    return stageProfileSchema.parse(await bb.storage.kv.get(key(projectId)) ?? { projectId, revision: 0, columns: [] });
  }
  async function scope(projectId: string) {
    await deps.assertProject(projectId);
    deps.assertGithub(projectId);
  }
  async function activeAdapter(projectId: string) {
    const adapter = await deps.adapter(projectId);
    if (!adapter.configured()) throw new Error(adapter.configurationMessage() ?? 'GitHub is not configured');
    return adapter;
  }
  function summary(projectId: string, item: WorkItemDetail | Omit<WorkItemDetail, 'bbProjectId'>): WorkItem {
    const { comments: _comments, ...rest } = item;
    return { ...rest, bbProjectId: projectId };
  }
  const changed = (projectId: string) => bb.realtime.publish('taskboard:changed', { projectId, source: 'github' });

  const handlers: PluginRpcHandlers<StageRpcContract> = {
    async getStageProfile({ projectId }) {
      await deps.assertProject(projectId);
      return { profile: await profile(projectId) };
    },
    async saveStageProfile(input) {
      await scope(input.projectId);
      return deps.mutate(input.projectId, async () => {
        const current = await profile(input.projectId);
        if (input.revision !== current.revision) throw new Error('Stage profile changed; reload before saving');
        const next = stageProfileSchema.parse({ ...input, revision: current.revision + 1 });
        await bb.storage.kv.set(key(input.projectId), next);
        changed(input.projectId);
        return { profile: next };
      });
    },
    async listStageItems({ projectId, offset, limit, expectedRevision }) {
      await scope(projectId);
      const current = await profile(projectId);
      const sync = deps.syncState(projectId);
      const revision = createHash('sha256').update(JSON.stringify([deps.revision(projectId), current.revision, sync.lastSyncedAt])).digest('hex');
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new Error('The board changed during pagination; refresh to load a consistent view');
      }
      const rows = deps.list(projectId, limit + 1, offset);
      return { profile: current, revision, lastSyncedAt: sync.lastSyncedAt, error: sync.error,
        items: rows.slice(0, limit).map(item => ({ item, stage: classifyStage(item.labels, current.columns) })),
        nextOffset: rows.length > limit ? offset + limit : null };
    },
    async stageOptions({ projectId, locator }) {
      await scope(projectId);
      const current = await profile(projectId);
      const item = summary(projectId, await (await activeAdapter(projectId)).get(locator));
      deps.persist(item);
      return { profile: current, item, stage: classifyStage(item.labels, current.columns) };
    },
    async updateItemStage(input) {
      await scope(input.projectId);
      return deps.mutate(input.projectId, async () => {
        const current = await profile(input.projectId);
        if (current.revision !== input.profileRevision) throw new Error('Stage profile changed; refresh before moving');
        if (!current.columns.some(c => c.label === input.label)) throw new Error('Stage is not configured for this project');
        const adapter = await activeAdapter(input.projectId);
        if (!adapter.updateStage) throw new Error('GitHub adapter cannot change stages');
        try {
          const item = summary(input.projectId, await adapter.updateStage(input.locator, input.label, input.expectedStageLabels));
          deps.persist(item);
          changed(input.projectId);
          return { item, stage: classifyStage(item.labels, current.columns) };
        } catch (error) {
          // Reconcile a partial write, but retain the failed/uncertain receipt.
          try { deps.persist(summary(input.projectId, await adapter.get(input.locator))); changed(input.projectId); } catch { /* retain last good cache */ }
          throw error;
        }
      });
    },
    async stageLabelSetup({ projectId, profileRevision, createMissing }) {
      await scope(projectId);
      const operation = async () => {
        const current = await profile(projectId);
        if (current.revision !== profileRevision) throw new Error('Stage profile changed; reload before preparing labels');
        const adapter = await activeAdapter(projectId);
        if (!adapter.stageLabelSetup) throw new Error('GitHub adapter cannot inspect stage labels');
        return { labels: await adapter.stageLabelSetup(current.columns.map(c => c.label), createMissing) };
      };
      return createMissing ? deps.mutate(projectId, operation) : operation();
    }
  };
  return { handlers, profile, stageLabels };
}
