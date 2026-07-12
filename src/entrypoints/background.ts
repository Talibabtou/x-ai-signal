import {
  ACCOUNT_EVIDENCE_SCHEMA_VERSION,
  type AccountEvidenceV1,
  type ClearAccountEvidenceMessage,
  type ClearAccountEvidenceResponse,
  type GetStorageSummaryMessage,
  isPostObservationV1,
  MAX_POST_AGE_MS,
  MAX_RECENT_POSTS,
  mergePostObservation,
  mergeProfileSnapshot,
  migrateAccountEvidence,
  type ObservePostMessage,
  type ObservePostResponse,
  type PostObservationV1,
  type StorageSummaryV1,
  scoreAccountEvidence,
  type UpdateProfileMessage,
  type UpdateProfileResponse,
} from '../scoring/account-evidence';

const ACCOUNT_STORAGE_PREFIX = 'account-evidence-v1:';
const WRITE_BATCH_DELAY_MS = 150;

type PendingObservation = {
  observation: PostObservationV1;
  resolve: (response: ObservePostResponse) => void;
  reject: (reason: unknown) => void;
};

type StorageAreaWithBytes = {
  getBytesInUse?: (keys?: string | string[] | null) => Promise<number>;
};

function storageKey(accountKey: string): string {
  return `${ACCOUNT_STORAGE_PREFIX}${accountKey}`;
}

function accountStorageKeys(stored: Record<string, unknown>): string[] {
  return Object.keys(stored).filter((key) => key.startsWith(ACCOUNT_STORAGE_PREFIX));
}

export default defineBackground(() => {
  let pendingObservations: PendingObservation[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushQueue: Promise<void> = Promise.resolve();

  const repairStoredEvidence = async () => {
    const stored = await browser.storage.local.get(null);
    const updates: Record<string, AccountEvidenceV1> = {};
    const removals: string[] = [];

    for (const key of accountStorageKeys(stored)) {
      const migrated = migrateAccountEvidence(stored[key]);
      if (!migrated || key !== storageKey(migrated.accountKey)) {
        removals.push(key);
        continue;
      }

      if (stored[key] !== migrated) updates[key] = migrated;
    }

    if (removals.length > 0) await browser.storage.local.remove(removals);
    if (Object.keys(updates).length > 0) await browser.storage.local.set(updates);
  };

  const storageReady = repairStoredEvidence();

  const flushBatch = async (batch: PendingObservation[]) => {
    try {
      await storageReady;
      const keys = [...new Set(batch.map(({ observation }) => storageKey(observation.accountKey)))];
      const stored = await browser.storage.local.get(keys);
      const accounts = new Map<string, AccountEvidenceV1 | null>();
      const updates: Record<string, AccountEvidenceV1> = {};
      const responses: ObservePostResponse[] = [];

      for (const item of batch) {
        const key = storageKey(item.observation.accountKey);
        let current = accounts.get(key);
        if (current === undefined) {
          current = migrateAccountEvidence(stored[key]);
        }

        const result = mergePostObservation(current, item.observation);
        accounts.set(key, result.account);
        if (result.stored) updates[key] = result.account;
        responses.push({ ...result, score: scoreAccountEvidence(result.account) });
      }

      if (Object.keys(updates).length > 0) await browser.storage.local.set(updates);
      batch.forEach((item, index) => {
        item.resolve(responses[index] as ObservePostResponse);
      });
    } catch (error) {
      batch.forEach((item) => {
        item.reject(error);
      });
    }
  };

  const drainPendingObservations = (): Promise<void> => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    if (pendingObservations.length === 0) return flushQueue;

    const batch = pendingObservations;
    pendingObservations = [];
    const operation = flushQueue.then(
      () => flushBatch(batch),
      () => flushBatch(batch),
    );
    flushQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  const queueObservation = (observation: PostObservationV1): Promise<ObservePostResponse> => {
    const response = new Promise<ObservePostResponse>((resolve, reject) => {
      pendingObservations.push({ observation, resolve, reject });
    });

    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => void drainPendingObservations(), WRITE_BATCH_DELAY_MS);
    }

    return response;
  };

  const updateProfile = async (
    message: UpdateProfileMessage,
  ): Promise<UpdateProfileResponse | undefined> => {
    await drainPendingObservations();
    await storageReady;

    const key = storageKey(message.accountKey);
    const stored = await browser.storage.local.get(key);
    const current = migrateAccountEvidence(stored[key]);
    const result = mergeProfileSnapshot(current, message.accountKey, message.profile);
    if (!result) return undefined;

    if (result.stored) await browser.storage.local.set({ [key]: result.account });

    return { ...result, score: scoreAccountEvidence(result.account) };
  };

  const getStorageSummary = async (): Promise<StorageSummaryV1> => {
    await drainPendingObservations();
    await repairStoredEvidence();
    const stored = await browser.storage.local.get(null);
    const keys = accountStorageKeys(stored);
    const accounts = keys
      .map((key) => migrateAccountEvidence(stored[key]))
      .filter((account): account is AccountEvidenceV1 => account !== null);
    const storageWithBytes = browser.storage.local as typeof browser.storage.local &
      StorageAreaWithBytes;
    const bytesInUse = storageWithBytes.getBytesInUse
      ? await storageWithBytes.getBytesInUse(keys)
      : new TextEncoder().encode(
          JSON.stringify(Object.fromEntries(keys.map((key) => [key, stored[key]]))),
        ).byteLength;

    return {
      schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
      bytesInUse,
      accountCount: accounts.length,
      observationCount: accounts.reduce((total, account) => total + account.observationCount, 0),
      maxRecentPostsPerAccount: MAX_RECENT_POSTS,
      maxPostAgeDays: MAX_POST_AGE_MS / (24 * 60 * 60 * 1000),
    };
  };

  const clearAccountEvidence = async (): Promise<ClearAccountEvidenceResponse> => {
    await drainPendingObservations();
    const stored = await browser.storage.local.get(null);
    const keys = accountStorageKeys(stored);
    if (keys.length > 0) await browser.storage.local.remove(keys);
    return { deletedAccountCount: keys.length };
  };

  browser.runtime.onMessage.addListener(
    async (
      message: unknown,
    ): Promise<
      | ObservePostResponse
      | UpdateProfileResponse
      | StorageSummaryV1
      | ClearAccountEvidenceResponse
      | undefined
    > => {
      const candidate = message as Partial<
        | ObservePostMessage
        | UpdateProfileMessage
        | GetStorageSummaryMessage
        | ClearAccountEvidenceMessage
      >;

      if (candidate.type === 'x-ai-signal:observe-post') {
        const observation = (message as Partial<ObservePostMessage>).observation;
        return isPostObservationV1(observation) ? queueObservation(observation) : undefined;
      }
      if (candidate.type === 'x-ai-signal:update-profile') {
        return updateProfile(message as UpdateProfileMessage);
      }
      if (candidate.type === 'x-ai-signal:get-storage-summary') return getStorageSummary();
      if (candidate.type === 'x-ai-signal:clear-account-evidence') return clearAccountEvidence();
      return undefined;
    },
  );
});
