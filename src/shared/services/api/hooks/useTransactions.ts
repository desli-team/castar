/**
 * Castar — Transaction React Query hooks
 *
 * GET    /transactions          — list (with filters)
 * GET    /transactions/summary  — aggregated totals
 * POST   /transactions          — create
 * GET    /transactions/:id      — detail
 * PUT    /transactions/:id      — update
 * DELETE /transactions/:id      — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../apiClient';
import { queryKeys } from '../queryClient';
import type {
  ServerTransaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  TransactionSummary,
} from '../types';

// ── Filter params (camelCase → snake_case query params) ──

export interface TransactionListParams {
  type?: 'income' | 'expense';
  categoryId?: string;
  accountId?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

function buildParams(p?: TransactionListParams): Record<string, string> | undefined {
  if (!p) return undefined;
  const params: Record<string, string> = {};
  if (p.type) params.type = p.type;
  if (p.categoryId) params.category_id = p.categoryId;
  if (p.accountId) params.account_id = p.accountId;
  if (p.dateFrom != null) params.date_from = String(p.dateFrom);
  if (p.dateTo != null) params.date_to = String(p.dateTo);
  if (p.limit != null) params.limit = String(p.limit);
  if (p.offset != null) params.offset = String(p.offset);
  return params;
}

// ── Queries ──

/** Fetch transaction list with optional filters */
export function useTransactions(params?: TransactionListParams) {
  const queryParams = buildParams(params);
  return useQuery({
    queryKey: queryKeys.transactions.list(queryParams),
    queryFn: () => apiClient.get<ServerTransaction[]>('/transactions', queryParams),
  });
}

/** Fetch a single transaction by ID */
export function useTransaction(id: string) {
  return useQuery({
    queryKey: queryKeys.transactions.detail(id),
    queryFn: () => apiClient.get<ServerTransaction>(`/transactions/${id}`),
    enabled: !!id,
  });
}

/** Fetch transaction summary (income, expense, net) for a period */
export function useTransactionSummary(params?: { dateFrom?: number; dateTo?: number }) {
  const queryParams: Record<string, string> = {};
  if (params?.dateFrom != null) queryParams.date_from = String(params.dateFrom);
  if (params?.dateTo != null) queryParams.date_to = String(params.dateTo);

  return useQuery({
    queryKey: queryKeys.transactions.summary(queryParams),
    queryFn: () => apiClient.get<TransactionSummary>('/transactions/summary', queryParams),
  });
}

// ── Mutations ──

/** Create a new transaction */
export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransactionRequest) =>
      apiClient.post<ServerTransaction>('/transactions', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all }); // balance changed
    },
  });
}

/** Update an existing transaction */
export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateTransactionRequest & { id: string }) =>
      apiClient.put<ServerTransaction>(`/transactions/${id}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      qc.invalidateQueries({ queryKey: queryKeys.transactions.detail(variables.id) });
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all }); // balance may change
    },
  });
}

/** Delete a transaction */
export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all }); // balance reverted
    },
  });
}
