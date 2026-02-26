/**
 * Project Workbench State Restore
 *
 * Restores document, data context, and token state for a persisted project design.
 */

import { loadProjectDesignState } from '@/lib/persistence/project-design-store';
import { loadProjectBundleAssociation } from '@/lib/persistence/project-bundle-store';
import { useDataContextStore } from '@/lib/stores/data-context';
import { useDocumentStateStore } from '@/lib/stores/document-state';
import { usePreviewStateStore } from '@/lib/stores/preview-state';
import { useStage1BundleStore } from '@/lib/stores/stage1-bundle';
import { useTokenStateStore } from '@/lib/stores/token-state';

export interface RestoreProjectDesignStateResult {
  restored: boolean;
  projectSlug: string;
  slug: string;
  tokenHistoryCount: number;
  dataContextKeyCount: number;
  associatedRunId: string | null;
  restoredAt: string;
}

export async function restoreProjectDesignState(
  projectSlug: string,
  slug: string,
  baseDir?: string
): Promise<RestoreProjectDesignStateResult> {
  const state = await loadProjectDesignState(projectSlug, slug, baseDir);
  const bundleAssociation = await loadProjectBundleAssociation(projectSlug, baseDir);

  useDocumentStateStore.getState().setDocument(state.document);
  useDataContextStore.getState().setContext(state.dataContext);
  useTokenStateStore.getState().hydrateFromSnapshot({
    tokens: state.tokenState.values,
    changes: state.tokenState.changes,
    history: state.tokenState.history.map((entry) => ({
      path: entry.path,
      from: entry.from,
      to: entry.to,
      source: entry.source,
      at: entry.at,
    })),
    annotations: state.tokenState.annotations ?? {},
  });
  usePreviewStateStore.getState().setTheme(state.tokenState.theme ?? 'base');
  if (bundleAssociation?.bundle) {
    useStage1BundleStore.getState().loadBundle(bundleAssociation.bundle);
  }

  return {
    restored: true,
    projectSlug,
    slug,
    tokenHistoryCount: state.tokenState.history.length,
    dataContextKeyCount: Object.keys(state.dataContext).length,
    associatedRunId: bundleAssociation?.sourceRun.runId ?? null,
    restoredAt: new Date().toISOString(),
  };
}
