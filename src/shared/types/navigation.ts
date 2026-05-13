/**
 * Castar — Navigation type definitions
 */

export type RootStackParamList = {
  Auth: undefined;
  PinLock: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Onboarding: undefined;
  TermsOfUse: undefined;
  PrivacyPolicy: undefined;
  TelegramAuth: undefined;
  EmailAuth: undefined;
  EmailVerify: { email: string };
  PhoneAuth: undefined;
  PhoneVerify: { phone: string };
  SetName: { from?: 'email' | 'phone' | 'telegram' } | undefined;
  SetPin: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  TasksTab: undefined;
  MonitoringTab: undefined;
  ProfileTab: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Transactions: { categoryId?: string; type?: 'income' | 'expense'; period?: 'all' | 'month' | 'week' } | undefined;
  TransactionDetail: { transactionId: string };
  Budgets: undefined;
  BudgetAlerts: undefined;
  BudgetDetail: { budgetId: string };
  AddTransaction: { type?: 'income' | 'expense' } | undefined;
  CreateBudget: { budgetId?: string; categoryId?: string } | undefined;
};

export type BudgetStackParamList = {
  Budgets: undefined;
  BudgetDetail: { budgetId: string };
  CreateBudget: undefined;
  FamilyBudget: { groupId: string };
};

export type TasksStackParamList = {
  Tasks: undefined;
  Recurrings: undefined;
  CreateRecurring: { recurringId?: string } | undefined;
  Debts: undefined;
  CreateDebt: { debtId?: string } | undefined;
  DebtDetail: { debtId: string };
  AddRepayment: { debtId: string };
};

export type MonitoringStackParamList = {
  Analytics: undefined;
  IncomeAnalytics: undefined;
  SpendingCategoryDetail: { categoryId: string; period: '1D' | '7D' | '14D' | '30D' };
  TransactionReview: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
  Categories: undefined;
  CategoryDetail: { categoryId: string };
  CreateCategory: { categoryId?: string } | undefined;
  SubscriptionManagement: undefined;
};
