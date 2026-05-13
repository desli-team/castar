import { create } from 'zustand';
import type { Debt, DebtRepayment } from '../../../shared/types';

interface DebtStore {
  debts: Debt[];
  repaymentsByDebt: Record<string, DebtRepayment[]>;
  isLoading: boolean;

  setDebts: (debts: Debt[]) => void;
  addDebt: (debt: Debt) => void;
  updateDebt: (id: string, data: Partial<Debt>) => void;
  removeDebt: (id: string) => void;
  setRepayments: (debtId: string, repayments: DebtRepayment[]) => void;
  addRepayment: (repayment: DebtRepayment) => void;
  setLoading: (loading: boolean) => void;
}

export const useDebtStore = create<DebtStore>((set) => ({
  debts: [],
  repaymentsByDebt: {},
  isLoading: false,

  setDebts: (debts) => set({ debts }),

  addDebt: (debt) => set((state) => ({ debts: [debt, ...state.debts] })),

  updateDebt: (id, data) => set((state) => ({
    debts: state.debts.map((debt) => (debt.id === id ? { ...debt, ...data } : debt)),
  })),

  removeDebt: (id) => set((state) => ({
    debts: state.debts.filter((debt) => debt.id !== id),
    repaymentsByDebt: Object.fromEntries(
      Object.entries(state.repaymentsByDebt).filter(([debtId]) => debtId !== id),
    ),
  })),

  setRepayments: (debtId, repayments) => set((state) => ({
    repaymentsByDebt: { ...state.repaymentsByDebt, [debtId]: repayments },
  })),

  addRepayment: (repayment) => set((state) => ({
    repaymentsByDebt: {
      ...state.repaymentsByDebt,
      [repayment.debtId]: [...(state.repaymentsByDebt[repayment.debtId] ?? []), repayment],
    },
  })),

  setLoading: (isLoading) => set({ isLoading }),
}));
