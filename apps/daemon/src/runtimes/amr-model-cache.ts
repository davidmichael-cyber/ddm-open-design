import type { AmrModelsResponse } from '@open-design/contracts';
import type { RuntimeModelOption } from './types.js';

type RemoteCacheEntry = {
  models: RuntimeModelOption[];
  fetchedAt: number;
};

type Fetchers = {
  fetchPreset: () => Promise<RuntimeModelOption[]>;
  fetchRemote: () => Promise<RuntimeModelOption[]>;
};

const DEFAULT_REMOTE_REFRESH_INTERVAL_MS = 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class AmrModelLoadingCache {
  private remote: RemoteCacheEntry | null = null;
  private inFlight: Promise<void> | null = null;
  private lastRemoteError: string | null = null;

  constructor(private readonly refreshIntervalMs = DEFAULT_REMOTE_REFRESH_INTERVAL_MS) {}

  async get(fetchers: Fetchers): Promise<AmrModelsResponse> {
    const now = Date.now();
    if (this.remote) {
      const staleByAge = now - this.remote.fetchedAt >= this.refreshIntervalMs;
      if (staleByAge) this.startRefresh(fetchers.fetchRemote);
      return {
        source: 'remote',
        models: this.remote.models,
        refreshing: this.inFlight !== null,
        ...(this.inFlight || this.lastRemoteError ? { stale: true } : {}),
        ...(this.lastRemoteError ? { remoteError: this.lastRemoteError } : {}),
      };
    }

    const preset = await fetchers.fetchPreset();
    this.startRefresh(fetchers.fetchRemote);
    return {
      source: 'preset',
      models: preset,
      refreshing: this.inFlight !== null,
      ...(this.lastRemoteError ? { remoteError: this.lastRemoteError } : {}),
    };
  }

  warm(fetchRemote: () => Promise<RuntimeModelOption[]>): void {
    this.startRefresh(fetchRemote);
  }

  resetForTests(): void {
    this.remote = null;
    this.inFlight = null;
    this.lastRemoteError = null;
  }

  private startRefresh(fetchRemote: () => Promise<RuntimeModelOption[]>): void {
    if (this.inFlight) return;
    this.inFlight = (async () => {
      try {
        const models = await fetchRemote();
        if (models.length === 0) {
          throw new Error('AMR remote model list returned no chat models');
        }
        this.remote = { models, fetchedAt: Date.now() };
        this.lastRemoteError = null;
      } catch (error) {
        this.lastRemoteError = errorMessage(error);
      } finally {
        this.inFlight = null;
      }
    })();
  }
}

export const amrModelLoadingCache = new AmrModelLoadingCache();
