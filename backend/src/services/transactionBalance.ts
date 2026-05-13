export interface TransactionBalanceState {
  accountId: string | null | undefined;
  type: string;
  amount: number;
}

export interface BalanceAdjustment extends TransactionBalanceState {
  revert?: boolean;
}

export function transactionBalanceChanged(
  existing: TransactionBalanceState,
  next: TransactionBalanceState,
): boolean {
  return existing.accountId !== next.accountId
    || existing.type !== next.type
    || existing.amount !== next.amount;
}

export function getTransactionBalanceAdjustments(
  existing: TransactionBalanceState | null,
  next: TransactionBalanceState,
): BalanceAdjustment[] {
  if (!existing) {
    return next.accountId ? [next] : [];
  }

  if (!transactionBalanceChanged(existing, next)) {
    return [];
  }

  return [
    { ...existing, revert: true },
    next,
  ];
}
