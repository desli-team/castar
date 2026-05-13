import { create } from 'zustand';
import type { RecurringTransaction } from '../../../shared/types';

interface RecurringStore {
  recurrings: RecurringTransaction[];
  isLoading: boolean;

  setRecurrings: (recurrings: RecurringTransaction[]) => void;
  addRecurring: (recurring: RecurringTransaction) => void;
  updateRecurring: (id: string, data: Partial<RecurringTransaction>) => void;
  removeRecurring: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useRecurringStore = create<RecurringStore>((set) => ({
  recurrings: [],
  isLoading: false,

  setRecurrings: (recurrings) => set({ recurrings }),

  addRecurring: (recurring) =>
    set((state) => ({ recurrings: [recurring, ...state.recurrings] })),

  updateRecurring: (id, data) =>
    set((state) => ({
      recurrings: state.recurrings.map((item) =>
        item.id === id ? { ...item, ...data } : item,
      ),
    })),

  removeRecurring: (id) =>
    set((state) => ({
      recurrings: state.recurrings.filter((item) => item.id !== id),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}));
