import type {
  ClearAccountEvidenceMessage,
  ClearAccountEvidenceResponse,
  GetStorageSummaryMessage,
  StorageSummaryV1,
} from '../../scoring/account-evidence';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}

const accountCount = requiredElement<HTMLElement>('account-count');
const observationCount = requiredElement<HTMLElement>('observation-count');
const storageSize = requiredElement<HTMLElement>('storage-size');
const retention = requiredElement<HTMLElement>('retention');
const deleteButton = requiredElement<HTMLButtonElement>('delete-evidence');
const status = requiredElement<HTMLElement>('status');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function loadSummary() {
  const message: GetStorageSummaryMessage = { type: 'x-ai-signal:get-storage-summary' };
  const summary = (await browser.runtime.sendMessage(message)) as StorageSummaryV1;

  accountCount.textContent = String(summary.accountCount);
  observationCount.textContent = String(summary.observationCount);
  storageSize.textContent = formatBytes(summary.bytesInUse);
  retention.textContent = `Retention: up to ${summary.maxRecentPostsPerAccount} recent posts per account for ${summary.maxPostAgeDays} days.`;
  deleteButton.disabled = summary.accountCount === 0;
}

deleteButton.addEventListener('click', async () => {
  const confirmed = window.confirm(
    'Delete every account observation stored by X AI Signal on this browser?',
  );
  if (!confirmed) return;

  deleteButton.disabled = true;
  status.textContent = 'Deleting…';

  try {
    const message: ClearAccountEvidenceMessage = { type: 'x-ai-signal:clear-account-evidence' };
    const result = (await browser.runtime.sendMessage(message)) as ClearAccountEvidenceResponse;
    status.textContent = `Deleted ${result.deletedAccountCount} account record(s). Refresh X to rebuild evidence.`;
    await loadSummary();
  } catch {
    status.textContent = 'Deletion failed. Reload the extension and try again.';
    deleteButton.disabled = false;
  }
});

void loadSummary().catch(() => {
  status.textContent = 'Could not read local evidence.';
});
