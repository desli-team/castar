import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { syncService, type SyncDiagnostics } from '../../../shared/services/sync/syncService';
import { useSettings } from '../../../shared/services/api/hooks/useSettings';
import { useSyncDevices } from '../../../shared/services/api/hooks/useSync';

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { data: settings } = useSettings();
  const { data: syncDevices } = useSyncDevices();

  const refreshDiagnostics = useCallback(async () => {
    setDiagnostics(await syncService.getDiagnostics());
  }, []);

  useEffect(() => {
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  const retrySync = async () => {
    setSyncing(true);
    try {
      syncService.retryFailed();
      await syncService.syncNow();
    } finally {
      setSyncing(false);
      refreshDiagnostics();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{t('profile.settings')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Plan & access</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>{settings?.tier === 'premium' ? 'Premium' : 'Free'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Custom categories</Text>
          <Text style={styles.value}>{settings?.entitlements?.canCreateCustomCategories ? 'Included' : 'Premium'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Analytics Pro</Text>
          <Text style={styles.value}>{settings?.entitlements?.canUseAnalyticsPro ? 'Included' : 'Premium'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Multi-device sync</Text>
          <Text style={styles.value}>
            {syncDevices ? `${syncDevices.devices.filter((device) => device.isActive).length}/${syncDevices.entitlements.maxSyncDevices} devices` : `${settings?.entitlements?.maxSyncDevices ?? 1} device`}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync health</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Connection</Text>
          <Text style={styles.value}>{diagnostics?.isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Pending changes</Text>
          <Text style={styles.value}>{diagnostics?.pending ?? 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Failed changes</Text>
          <Text style={[styles.value, (diagnostics?.failed ?? 0) > 0 && styles.errorValue]}>{diagnostics?.failed ?? 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last sync</Text>
          <Text style={styles.value}>
            {diagnostics?.lastSyncAt ? new Date(diagnostics.lastSyncAt).toLocaleString() : 'Not synced yet'}
          </Text>
        </View>
        {diagnostics?.lastFailedItem && (
          <Text style={styles.errorText} numberOfLines={3}>
            Last error: {diagnostics.lastFailedItem.tableName}/{diagnostics.lastFailedItem.action} — {diagnostics.lastFailedItem.lastError ?? 'Unknown error'}
          </Text>
        )}
        <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={retrySync} disabled={syncing}>
          <Text style={styles.buttonText}>{syncing ? 'Syncing…' : 'Retry sync now'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.base,
    gap: spacing.md,
  },
  cardTitle: {
    ...typography.bodySemiBold,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    ...typography.body,
    color: colors.textTertiary,
  },
  value: {
    ...typography.bodySemiBold,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  errorValue: {
    color: colors.error[500],
  },
  errorText: {
    ...typography.caption,
    color: colors.error[500],
  },
  button: {
    minHeight: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  buttonText: {
    ...typography.bodySemiBold,
    color: colors.background,
  },
});
