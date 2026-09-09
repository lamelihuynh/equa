import {
  parseDomainEvent,
  type SyncOperation,
  type SyncRequest,
  type SyncResult,
} from '@equa/contracts';

import type { LocalOperation, LocalStore } from '../db/local-store';

export interface SyncTransport {
  push(accessToken: string, request: SyncRequest): Promise<SyncResult[]>;
  pull?(accessToken: string, cursor?: string): Promise<{ cursor?: string; events: unknown[] }>;
}

export interface Connectivity {
  subscribe(listener: (online: boolean) => void): () => void;
}

export class SyncTransportError extends Error {
  constructor(
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly code?: string,
    readonly retryable = status === undefined || status === 408 || status === 429 || status >= 500,
  ) {
    super(code ?? (status ? `Sync failed (${status}).` : 'Network sync failure.'));
  }
}

export class SyncClient {
  private stopped = false;
  private generation = 0;
  private flushing: Promise<void> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pullRetryTimer: ReturnType<typeof setTimeout> | undefined;
  private pullAttempts = 0;
  private unsubscribeConnectivity: (() => void) | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private pulling: Promise<void> | undefined;
  private online = true;
  private scheduleGeneration = 0;
  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    private readonly access: (refresh?: boolean) => Promise<string | null>,
    private readonly now: () => number = () => Date.now(),
    private readonly connectivity?: Connectivity,
  ) {}

  start(ownerId: string): void {
    this.stopped = false;
    this.unsubscribeConnectivity?.();
    this.unsubscribeStore?.();
    this.unsubscribeStore = this.store.subscribe(() => {
      void this.reschedule(ownerId);
    });
    this.unsubscribeConnectivity = this.connectivity?.subscribe((online) => {
      const restored = !this.online && online;
      this.online = online;
      if (restored) this.reconnect(ownerId);
    });
    void this.pullOnce(ownerId).catch(() => this.schedulePullRetry(ownerId));
    void this.reschedule(ownerId);
  }
  stop(): void {
    this.stopped = true;
    this.generation += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.pullRetryTimer) clearTimeout(this.pullRetryTimer);
    this.pullRetryTimer = undefined;
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = undefined;
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
  }
  reconnect(ownerId: string): void {
    if (!this.stopped && this.online) this.scheduleAt(ownerId, this.now());
  }
  async flush(ownerId: string): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushAll(ownerId);
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
      void this.reschedule(ownerId);
    }
  }

  private scheduleAt(ownerId: string, wakeAt: number): void {
    if (this.stopped) return;
    const generation = ++this.scheduleGeneration;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(
      () => {
        if (generation !== this.scheduleGeneration || this.stopped) return;
        this.retryTimer = undefined;
        void this.flush(ownerId).catch(() => {
          void this.reschedule(ownerId);
        });
      },
      Math.max(0, wakeAt - this.now()),
    );
  }

  private async reschedule(ownerId: string): Promise<void> {
    const generation = ++this.scheduleGeneration;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.stopped || !this.online) return;
    const wakeAt = await this.store.nextWakeAt(ownerId);
    if (
      generation !== this.scheduleGeneration ||
      this.stopped ||
      !this.online ||
      this.pullRetryTimer !== undefined ||
      wakeAt === undefined
    )
      return;
    this.scheduleAt(ownerId, wakeAt);
  }
  private async flushAll(ownerId: string): Promise<void> {
    const generation = this.generation;
    if (this.stopped) return;
    try {
      await this.pullOnce(ownerId, generation);
    } catch {
      this.schedulePullRetry(ownerId);
      return;
    }
    for (;;) {
      const rows = await this.store.claim(ownerId, 20, this.now());
      if (!rows.length || this.stopped || generation !== this.generation) return;
      const firstDevice = rows[0]!.deviceId;
      const batch = rows.filter((row) => row.deviceId === firstDevice);
      const token = await this.access();
      if (!token || this.stopped || generation !== this.generation) return;
      try {
        const results = await this.send(token, batch, generation);
        await this.applyResults(ownerId, batch, results, generation);
      } catch (error) {
        const retryable = isRetryable(error);
        const delay = retryDelay(rows[0]!.attempts, error);
        for (const row of batch) {
          if (!row.claimToken || this.stopped || generation !== this.generation) return;
          await this.store.retry(
            ownerId,
            row.id,
            row.claimToken,
            this.now() + delay,
            !retryable,
            error instanceof SyncTransportError ? error.code : undefined,
            error instanceof Error ? error.message : undefined,
          );
        }
        return;
      }
      try {
        await this.pullOnce(ownerId, generation);
      } catch {
        this.schedulePullRetry(ownerId);
        return;
      }
    }
  }
  private async send(token: string, rows: LocalOperation[], generation: number) {
    const request: SyncRequest = {
      version: 1,
      deviceId: rows[0]!.deviceId,
      operations: rows.map((row) => JSON.parse(row.payload) as SyncOperation),
    };
    try {
      return await this.transport.push(token, request);
    } catch (error) {
      if (
        !(error instanceof SyncTransportError) ||
        error.status !== 401 ||
        generation !== this.generation
      )
        throw error;
      const refreshed = await this.access(true);
      if (!refreshed || this.stopped || generation !== this.generation) throw error;
      return this.transport.push(refreshed, request);
    }
  }
  private async applyResults(
    ownerId: string,
    rows: LocalOperation[],
    results: SyncResult[],
    generation: number,
  ): Promise<void> {
    const byId = new Map(results.map((result) => [result.id, result]));
    for (const row of rows) {
      if (!row.claimToken || this.stopped || generation !== this.generation) return;
      const result = byId.get(row.id);
      if (result?.status === 'applied')
        await this.store.complete(ownerId, row.id, row.claimToken, result.version);
      else if (result?.status === 'conflict')
        await this.store.conflict(ownerId, row.id, row.claimToken);
      else
        await this.store.retry(
          ownerId,
          row.id,
          row.claimToken,
          this.now() + retryDelay(row.attempts),
          result?.retryable === false || row.attempts >= 7,
          result?.code ?? (result ? undefined : 'MISSING_SYNC_RESULT'),
          result?.code,
        );
    }
  }

  private async pullOnce(ownerId: string, generation = this.generation): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pulling = this.pullOnceUnlocked(ownerId, generation);
    try {
      await this.pulling;
    } finally {
      this.pulling = undefined;
    }
  }

  private async pullOnceUnlocked(ownerId: string, generation: number): Promise<void> {
    if (!this.transport.pull || this.stopped || generation !== this.generation || !this.online)
      return;
    const deviceId = await this.store.primaryDevice(ownerId);
    if (!deviceId || this.stopped || generation !== this.generation) return;
    const token = await this.access();
    if (!token || this.stopped || generation !== this.generation) return;
    const cursor = await this.store.feedCursor(ownerId, deviceId);
    let pageCursor = cursor;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      let page: { cursor?: string; events: unknown[] };
      try {
        page = await this.transport.pull(token, pageCursor);
      } catch (error) {
        if (!(error instanceof SyncTransportError) || error.status !== 401) throw error;
        const refreshed = await this.access(true);
        if (!refreshed || this.stopped || generation !== this.generation) throw error;
        page = await this.transport.pull(refreshed, pageCursor);
      }
      if (!Array.isArray(page.events)) throw new Error('Invalid sync feed response.');
      for (const value of page.events) {
        const event = parseDomainEvent(value);
        if (!event || event.ownerId !== ownerId)
          throw new Error('Sync feed contains an invalid or foreign event.');
      }
      const nextCursor = page.cursor ?? pageCursor;
      if (page.events.length && nextCursor === pageCursor)
        throw new Error('Sync feed cursor did not advance.');
      if (this.stopped || generation !== this.generation) return;
      await this.store.applyFeed(ownerId, deviceId, page.events, nextCursor);
      if (!page.events.length || !page.cursor) {
        this.pullAttempts = 0;
        return;
      }
      pageCursor = page.cursor;
    }
    throw new Error('Sync feed exceeded the page limit.');
  }

  private schedulePullRetry(ownerId: string): void {
    if (this.stopped || !this.online || this.pullRetryTimer) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.scheduleGeneration += 1;
    const delay = Math.min(300_000, 1_000 * 2 ** Math.min(this.pullAttempts, 8));
    this.pullAttempts += 1;
    this.pullRetryTimer = setTimeout(() => {
      this.pullRetryTimer = undefined;
      void this.pullOnce(ownerId)
        .catch(() => this.schedulePullRetry(ownerId))
        .finally(() => {
          void this.reschedule(ownerId);
        });
    }, delay);
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof SyncTransportError ? error.retryable : true;
}

function retryDelay(attempts: number, error?: unknown): number {
  if (error instanceof SyncTransportError && error.retryAfterMs !== undefined)
    return error.retryAfterMs;
  return Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
}
