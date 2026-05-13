/**
 * Castar — Sync React Query hooks
 *
 * POST /sync/push  — push local changes to server
 * POST /sync/pull  — pull server changes since timestamp
 * POST /sync/full  — push + pull in one request
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../apiClient';
import { queryKeys } from '../queryClient';
import type {
  SyncPushRequest,
  SyncPullRequest,
  SyncFullRequest,
  SyncPushResult,
  SyncPullResult,
  SyncFullResult,
  SyncDevicesResult,
  RegisterSyncDeviceRequest,
} from '../types';

// ── Queries ──

/** List registered sync devices for the current user. */
export function useSyncDevices() {
  return useQuery({
    queryKey: [...queryKeys.settings.all, 'syncDevices'],
    queryFn: () => apiClient.get<SyncDevicesResult>('/sync/devices'),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ──

/** Register or refresh this app install as a sync device. */
export function useRegisterSyncDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RegisterSyncDeviceRequest) => apiClient.post<{ id: string }>('/sync/devices', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...queryKeys.settings.all, 'syncDevices'] }),
  });
}

/** Push local sync queue to server */
export function useSyncPush() {
  return useMutation({
    mutationFn: (data: SyncPushRequest) =>
      apiClient.post<SyncPushResult>('/sync/push', data),
  });
}

/** Pull server changes since last_synced_at */
export function useSyncPull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncPullRequest) =>
      apiClient.post<SyncPullResult>('/sync/pull', data),
    onSuccess: () => {
      // After pulling new data, invalidate all entity queries
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all });
      qc.invalidateQueries({ queryKey: queryKeys.budgets.all });
      qc.invalidateQueries({ queryKey: queryKeys.recurrings.all });
    },
  });
}

/** Full sync: push local + pull remote in one request */
export function useSyncFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncFullRequest) =>
      apiClient.post<SyncFullResult>('/sync/full', data),
    onSuccess: () => {
      // Invalidate everything after a full sync
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all });
      qc.invalidateQueries({ queryKey: queryKeys.budgets.all });
      qc.invalidateQueries({ queryKey: queryKeys.recurrings.all });
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}
