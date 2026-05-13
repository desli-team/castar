import React, { useEffect, useState, useCallback, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { NavigationState } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider } from 'posthog-react-native';
import { colors } from '../../shared/constants';
import { useAuthStore } from '../../features/auth/store/authStore';
import { useProfileStore } from '../../features/profile/store/profileStore';
import { useBudgetStore } from '../../features/budget/store/budgetStore';
import { useTransactionStore } from '../../features/transactions/store/transactionStore';
import { useCategoryStore } from '../../features/categories/store/categoryStore';
import { useRecurringStore } from '../../features/recurring/store/recurringStore';
import { queryClient } from '../../shared/services/api/queryClient';
import { initEncryptedDb } from '../../shared/services/database/connection';
import { runMigrations } from '../../shared/services/database/migrations';
import * as budgetQueries from '../../shared/services/database/budgetQueries';
import * as transactionQueries from '../../shared/services/database/transactionQueries';
import * as categoryQueries from '../../shared/services/database/categoryQueries';
import * as recurringQueries from '../../shared/services/database/recurringQueries';
import { POSTHOG_API_KEY, POSTHOG_HOST, isPostHogConfigured } from '../../shared/services/analytics/posthog';
import { runRecurringCatchUp } from '../../shared/services/recurring/recurringGenerator';
import { evaluateBudgetAlerts } from '../../features/budget/services/budgetAlertService';
import { syncService } from '../../shared/services/sync/syncService';

// Initialize i18n
import '../../shared/i18n';

const NAV_STATE_KEY = 'castar_nav_state';

interface AppProvidersProps {
  children: React.ReactNode;
}

const navigationTheme = {
  dark: true,
  colors: {
    primary: colors.white[100],
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.error[500],
  },
  fonts: {
    regular: { fontFamily: 'Inter_400Regular', fontWeight: '400' as const },
    medium: { fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
    bold: { fontFamily: 'Inter_700Bold', fontWeight: '700' as const },
    heavy: { fontFamily: 'Inter_700Bold', fontWeight: '700' as const },
  },
};

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const initializeSettings = useProfileStore((s) => s.initializeSettings);
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState<NavigationState | undefined>();

  // Restore auth + settings + navigation state in parallel on app start
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize encrypted SQLite DB FIRST — auth/settings may depend on it
        await initEncryptedDb();

        // Create tables if they don't exist yet
        runMigrations();

        const [, , savedNav] = await Promise.all([
          initializeAuth(),
          initializeSettings(),
          SecureStore.getItemAsync(NAV_STATE_KEY),
        ]);
        if (savedNav) {
          setInitialState(JSON.parse(savedNav));
        }

        // Load persisted data from SQLite into Zustand stores
        const userId = useAuthStore.getState().userId;
        if (userId) {
          try {
            useBudgetStore.getState().setBudgets(budgetQueries.findByUser(userId));
            useTransactionStore.getState().setTransactions(transactionQueries.findByUser(userId, 10000));
            useCategoryStore.getState().setCategories(categoryQueries.findByUser(userId));
            useRecurringStore.getState().setRecurrings(recurringQueries.findAll().filter((item) => item.userId === userId));
            evaluateBudgetAlerts(userId, budgetQueries.findByUser(userId), transactionQueries.findByUser(userId, 1000));
            runRecurringCatchUp(userId)
              .then(() => syncService.syncNow())
              .catch(() => {});
          } catch {
            // DB read failed — stores stay empty, user can still create new data
          }
        }
      } catch {
        // Ignore errors — start fresh
      } finally {
        setIsReady(true);
      }
    };
    init();
  }, [initializeAuth, initializeSettings]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      syncService.setOnlineStatus(online);
    });

    return unsubscribe;
  }, []);

  // Persist navigation state (debounced — avoids writing on every tab switch)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onStateChange = useCallback((state: NavigationState | undefined) => {
    if (state) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        SecureStore.setItemAsync(NAV_STATE_KEY, JSON.stringify(state)).catch(() => {});
      }, 1000);
    }
  }, []);

  if (!isReady) {
    return null;
  }

  const navigation = (
    <NavigationContainer
      theme={navigationTheme}
      initialState={initialState}
      onStateChange={onStateChange}
    >
      <StatusBar style="light" translucent backgroundColor="transparent" />
      {children}
    </NavigationContainer>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isPostHogConfigured() ? (
        <PostHogProvider
          apiKey={POSTHOG_API_KEY}
          options={{
            host: POSTHOG_HOST,
            captureAppLifecycleEvents: false,
          }}
          autocapture={false}
        >
          {navigation}
        </PostHogProvider>
      ) : (
        navigation
      )}
    </QueryClientProvider>
  );
};
