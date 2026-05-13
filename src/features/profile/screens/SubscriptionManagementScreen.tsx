import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  InteractionManager,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { colors, fontFamily, borderRadius } from '../../../shared/constants';
import { GlowCircle1, GlowCircle2 } from '../../../shared/components/GlowImage';
import { useSettings } from '../../../shared/services/api/hooks/useSettings';
import type { ServerSettings } from '../../../shared/services/api/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIGMA_WIDTH = 393;
const scale = (v: number) => (v / FIGMA_WIDTH) * SCREEN_WIDTH;

// ═══════════════════════════════════════════════
// Glow positioning constants — same as ProfileScreen
// ═══════════════════════════════════════════════

const GLOW_RENDER_SIZE = 1050;
const GLOW2_RENDER_SIZE = 477;

// Back arrow — 28x28, stroke white (same as auth screens)
const BackArrowIcon = React.memo(() => (
  <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
    <Path
      d="M23.3334 14H4.66675M4.66675 14L11.6667 7M4.66675 14L11.6667 21"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

const ICON_BG = 'M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z';

const IconCategories = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d={ICON_BG} fill="white" fillOpacity={0.1} />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.8869 10.887C9.6665 12.1074 9.6665 14.0716 9.6665 18C9.6665 21.9283 9.6665 23.8925 10.8869 25.1129C12.1073 26.3333 14.0715 26.3333 17.9998 26.3333C21.9282 26.3333 23.8924 26.3333 25.1128 25.1129C26.3332 23.8925 26.3332 21.9283 26.3332 18C26.3332 14.0716 26.3332 12.1074 25.1128 10.887C23.8924 9.66663 21.9282 9.66663 17.9998 9.66663C14.0715 9.66663 12.1073 9.66663 10.8869 10.887ZM16.7858 14.2643C17.0238 14.0144 17.0142 13.6188 16.7642 13.3807C16.5142 13.1427 16.1186 13.1523 15.8806 13.4023L13.9522 15.427L13.4524 14.9023C13.2144 14.6523 12.8188 14.6427 12.5688 14.8807C12.3188 15.1188 12.3092 15.5144 12.5473 15.7643L13.4996 16.7643C13.6176 16.8882 13.7812 16.9583 13.9522 16.9583C14.1233 16.9583 14.2868 16.8882 14.4048 16.7643L16.7858 14.2643ZM18.8332 14.875C18.488 14.875 18.2082 15.1548 18.2082 15.5C18.2082 15.8451 18.488 16.125 18.8332 16.125H22.9998C23.345 16.125 23.6248 15.8451 23.6248 15.5C23.6248 15.1548 23.345 14.875 22.9998 14.875H18.8332ZM16.7858 20.0977C17.0238 19.8477 17.0142 19.4521 16.7642 19.214C16.5142 18.976 16.1186 18.9856 15.8806 19.2356L13.9522 21.2604L13.4524 20.7356C13.2144 20.4856 12.8188 20.476 12.5688 20.714C12.3188 20.9521 12.3092 21.3477 12.5473 21.5977L13.4996 22.5977C13.6176 22.7215 13.7812 22.7916 13.9522 22.7916C14.1233 22.7916 14.2868 22.7215 14.4048 22.5977L16.7858 20.0977ZM18.8332 20.7083C18.488 20.7083 18.2082 20.9881 18.2082 21.3333C18.2082 21.6785 18.488 21.9583 18.8332 21.9583H22.9998C23.345 21.9583 23.6248 21.6785 23.6248 21.3333C23.6248 20.9881 23.345 20.7083 22.9998 20.7083H18.8332Z"
      fill="white"
    />
  </Svg>
));

const IconBudgets = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d={ICON_BG} fill="white" fillOpacity={0.1} />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M24.5625 25.1597C24.0278 24.7061 23.2222 24.7061 22.6875 25.1597C22.1528 25.6134 21.3472 25.6134 20.8125 25.1597C20.2778 24.7061 19.4722 24.7061 18.9375 25.1597C18.4028 25.6134 17.5972 25.6134 17.0625 25.1597C16.5278 24.7061 15.7222 24.7061 15.1875 25.1597C14.6528 25.6134 13.8472 25.6134 13.3125 25.1597C12.7778 24.7061 11.9722 24.7061 11.4375 25.1597C11.0742 25.468 10.5 25.2218 10.5 24.7578V11.2422C10.5 10.7782 11.0742 10.532 11.4375 10.8403C11.9722 11.2939 12.7778 11.2939 13.3125 10.8403C13.8472 10.3866 14.6528 10.3866 15.1875 10.8403C15.7222 11.2939 16.5278 11.2939 17.0625 10.8403C17.5972 10.3866 18.4028 10.3866 18.9375 10.8403C19.4722 11.2939 20.2778 11.2939 20.8125 10.8403C21.3472 10.3866 22.1528 10.3866 22.6875 10.8403C23.2222 11.2939 24.0278 11.2939 24.5625 10.8403C24.9258 10.532 25.5 10.7782 25.5 11.2422V24.7578C25.5 25.2218 24.9258 25.468 24.5625 25.1597ZM13.625 18C13.625 17.6548 13.9048 17.375 14.25 17.375H21.75C22.0952 17.375 22.375 17.6548 22.375 18C22.375 18.3452 22.0952 18.625 21.75 18.625H14.25C13.9048 18.625 13.625 18.3452 13.625 18ZM14.25 14.4583C13.9048 14.4583 13.625 14.7382 13.625 15.0833C13.625 15.4285 13.9048 15.7083 14.25 15.7083H21.75C22.0952 15.7083 22.375 15.4285 22.375 15.0833C22.375 14.7382 22.0952 14.4583 21.75 14.4583H14.25ZM13.625 20.9167C13.625 20.5715 13.9048 20.2917 14.25 20.2917H21.75C22.0952 20.2917 22.375 20.5715 22.375 20.9167C22.375 21.2618 22.0952 21.5417 21.75 21.5417H14.25C13.9048 21.5417 13.625 21.2618 13.625 20.9167Z"
      fill="white"
    />
  </Svg>
));

const IconAnalytics = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d={ICON_BG} fill="white" fillOpacity={0.1} />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.8869 10.887C9.6665 12.1074 9.6665 14.0716 9.6665 18C9.6665 21.9283 9.6665 23.8925 10.8869 25.1129C12.1073 26.3333 14.0715 26.3333 17.9998 26.3333C21.9282 26.3333 23.8924 26.3333 25.1128 25.1129C26.3332 23.8925 26.3332 21.9283 26.3332 18C26.3332 14.0716 26.3332 12.1074 25.1128 10.887C23.8924 9.66663 21.9282 9.66663 17.9998 9.66663C14.0715 9.66663 12.1073 9.66663 10.8869 10.887ZM22.6466 16.7334C22.8676 16.4682 22.8318 16.0741 22.5666 15.8532C22.3014 15.6322 21.9073 15.668 21.6864 15.9332L20.189 17.7301C19.88 18.1009 19.6902 18.3262 19.5339 18.4674C19.4614 18.5328 19.4184 18.5589 19.3978 18.5689C19.3936 18.5709 19.3906 18.5721 19.3887 18.5728C19.3887 18.5728 19.3852 18.5715 19.3823 18.5702L19.3797 18.5689C19.3591 18.5589 19.3161 18.5328 19.2436 18.4674C19.0872 18.3262 18.8975 18.1009 18.5885 17.7301L18.3448 17.4377C18.0711 17.1091 17.8244 16.813 17.5939 16.6048C17.3431 16.3784 17.0272 16.1767 16.6109 16.1767C16.1947 16.1767 15.8788 16.3784 15.628 16.6048C15.3975 16.813 15.1508 17.1091 14.8771 17.4377L13.353 19.2665C13.1321 19.5317 13.1679 19.9258 13.4331 20.1468C13.6982 20.3677 14.0923 20.3319 14.3133 20.0667L15.8107 18.2699C16.1197 17.8991 16.3095 17.6737 16.4658 17.5325C16.5383 17.4671 16.5813 17.441 16.6019 17.431C16.6041 17.43 16.606 17.4291 16.6075 17.4284L16.6109 17.4271C16.6128 17.4278 16.6158 17.429 16.62 17.431C16.6406 17.441 16.6836 17.4671 16.7561 17.5325C16.9124 17.6737 17.1022 17.8991 17.4112 18.2699L17.6548 18.5623C17.9286 18.8908 18.1753 19.187 18.4058 19.3951C18.6566 19.6216 18.9725 19.8233 19.3887 19.8233C19.805 19.8233 20.1209 19.6216 20.3716 19.3951C20.6021 19.187 20.8489 18.8908 21.1226 18.5623L22.6466 16.7334Z"
      fill="white"
    />
  </Svg>
));

const IconAutomation = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d={ICON_BG} fill="white" fillOpacity={0.1} />
    <Path
      d="M18 10.5C13.8579 10.5 10.5 13.8579 10.5 18C10.5 22.1421 13.8579 25.5 18 25.5C21.4697 25.5 24.3896 23.1436 25.2461 19.9444"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <Path
      d="M25.5 12.5V17H21"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M17.9998 14.6666V18.2916L20.4165 19.5"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

const IconSync = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d={ICON_BG} fill="white" fillOpacity={0.1} />
    <Path
      d="M13 15.5C13.9361 13.7209 15.8034 12.5 17.9583 12.5C20.0802 12.5 21.9232 13.6837 22.873 15.4183"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <Path
      d="M21.25 15.5H23.25V13.5"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M23 20.5C22.0639 22.2791 20.1966 23.5 18.0417 23.5C15.9198 23.5 14.0768 22.3163 13.127 20.5817"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <Path
      d="M14.75 20.5H12.75V22.5"
      stroke="white"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

type SubscriptionDisplayState = 'free' | 'premium_active' | 'trialing' | 'past_due' | 'expired';
type Accent = 'neutral' | 'premium' | 'warning';

type SubscriptionViewModel = {
  state: SubscriptionDisplayState;
  accent: Accent;
  chipKey: string;
  chipDefault: string;
  heroTitleKey: string;
  heroTitleDefault: string;
  heroSubtitleKey: string;
  heroSubtitleDefault: string;
  benefitsTitleKey: string;
  benefitsTitleDefault: string;
  primaryButtonKey: string;
  primaryButtonDefault: string;
  readinessKey: string;
  readinessDefault: string;
};

const BENEFITS: { Icon: React.FC; titleKey: string; titleDefault: string; detailKey: string; detailDefault: string }[] = [
  {
    Icon: IconCategories,
    titleKey: 'subscription.benefitCategoriesTitle',
    titleDefault: 'Custom categories',
    detailKey: 'subscription.benefitCategoriesDetail',
    detailDefault: 'Create your own category system.',
  },
  {
    Icon: IconAnalytics,
    titleKey: 'subscription.benefitAnalyticsTitle',
    titleDefault: 'Analytics Pro',
    detailKey: 'subscription.benefitAnalyticsDetail',
    detailDefault: 'See deeper cashflow and spending insights.',
  },
  {
    Icon: IconBudgets,
    titleKey: 'subscription.benefitBudgetsTitle',
    titleDefault: 'Budget alerts',
    detailKey: 'subscription.benefitBudgetsDetail',
    detailDefault: 'Get notified before budgets become risky.',
  },
  {
    Icon: IconAutomation,
    titleKey: 'subscription.benefitAutomationTitle',
    titleDefault: 'Recurring automation',
    detailKey: 'subscription.benefitAutomationDetail',
    detailDefault: 'Automate repeat payments and income.',
  },
  {
    Icon: IconSync,
    titleKey: 'subscription.benefitSyncTitle',
    titleDefault: 'Multi-device sync',
    detailKey: 'subscription.benefitSyncDetail',
    detailDefault: 'Use Castar across your devices.',
  },
];

const isFutureTimestamp = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) && value > Date.now()
);

const formatSubscriptionDate = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= Date.now()) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value));
};

const buildSubscriptionViewModel = (settings?: ServerSettings | null): SubscriptionViewModel => {
  const tier = settings?.tier === 'premium' ? 'premium' : 'free';
  const status = settings?.subscriptionStatus ?? 'none';
  const hasActiveDate = isFutureTimestamp(settings?.premiumUntil);

  if (status === 'past_due') {
    return {
      state: 'past_due',
      accent: 'warning',
      chipKey: 'subscription.chipPaymentIssue',
      chipDefault: 'Payment issue',
      heroTitleKey: 'subscription.pastDueTitle',
      heroTitleDefault: 'Premium needs attention',
      heroSubtitleKey: 'subscription.pastDueSubtitle',
      heroSubtitleDefault: 'Update payment to keep Premium features active.',
      benefitsTitleKey: 'subscription.pastDueBenefitsTitle',
      benefitsTitleDefault: 'Premium features',
      primaryButtonKey: 'subscription.updatePayment',
      primaryButtonDefault: 'Update payment',
      readinessKey: 'subscription.paymentUpdatesSoon',
      readinessDefault: 'Payment updates are coming soon',
    };
  }

  if (status === 'trialing' && tier === 'premium') {
    return {
      state: 'trialing',
      accent: 'premium',
      chipKey: 'subscription.chipTrial',
      chipDefault: 'Trial',
      heroTitleKey: 'subscription.trialTitle',
      heroTitleDefault: 'Premium trial is active',
      heroSubtitleKey: hasActiveDate ? 'subscription.trialEnds' : 'subscription.trialSubtitle',
      heroSubtitleDefault: hasActiveDate ? 'Trial ends {{date}}' : 'Explore Premium features during your trial',
      benefitsTitleKey: 'subscription.trialBenefitsTitle',
      benefitsTitleDefault: 'Included during your trial',
      primaryButtonKey: 'subscription.manageTrial',
      primaryButtonDefault: 'Manage trial',
      readinessKey: 'subscription.subscriptionManagementSoon',
      readinessDefault: 'Subscription management is coming soon',
    };
  }

  if (tier === 'premium' && status !== 'canceled' && (settings?.premiumUntil == null || hasActiveDate)) {
    return {
      state: 'premium_active',
      accent: 'premium',
      chipKey: 'subscription.chipPremium',
      chipDefault: 'Premium',
      heroTitleKey: 'subscription.premiumActiveTitle',
      heroTitleDefault: 'Premium is active',
      heroSubtitleKey: hasActiveDate ? 'subscription.activeUntil' : 'subscription.premiumActiveSubtitle',
      heroSubtitleDefault: hasActiveDate ? 'Active until {{date}}' : 'Your Premium access is active',
      benefitsTitleKey: 'subscription.premiumBenefitsTitle',
      benefitsTitleDefault: 'Included with your Premium',
      primaryButtonKey: 'subscription.manageSubscription',
      primaryButtonDefault: 'Manage subscription',
      readinessKey: 'subscription.subscriptionManagementSoon',
      readinessDefault: 'Subscription management is coming soon',
    };
  }

  if (status === 'canceled' || (settings?.premiumUntil != null && !hasActiveDate && status !== 'none')) {
    return {
      state: 'expired',
      accent: 'neutral',
      chipKey: 'subscription.chipFree',
      chipDefault: 'Free',
      heroTitleKey: 'subscription.expiredTitle',
      heroTitleDefault: 'Premium is inactive',
      heroSubtitleKey: 'subscription.expiredSubtitle',
      heroSubtitleDefault: 'Reactivate Premium to use advanced Castar tools.',
      benefitsTitleKey: 'subscription.premiumIncludes',
      benefitsTitleDefault: 'Premium includes',
      primaryButtonKey: 'subscription.reactivatePremium',
      primaryButtonDefault: 'Reactivate Premium',
      readinessKey: 'subscription.paymentsSoon',
      readinessDefault: 'Payments are coming soon',
    };
  }

  return {
    state: 'free',
    accent: 'neutral',
    chipKey: 'subscription.chipFree',
    chipDefault: 'Free',
    heroTitleKey: 'subscription.upgradeTitle',
    heroTitleDefault: 'Upgrade to Premium',
    heroSubtitleKey: 'subscription.upgradeSubtitle',
    heroSubtitleDefault: 'Get advanced tools for deeper control over your money.',
    benefitsTitleKey: 'subscription.premiumIncludes',
    benefitsTitleDefault: 'Premium includes',
    primaryButtonKey: 'subscription.upgradeToPremium',
    primaryButtonDefault: 'Upgrade to Premium',
    readinessKey: 'subscription.paymentsSoon',
    readinessDefault: 'Payments are coming soon',
  };
};

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

export const SubscriptionManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => handle.cancel();
  }, []);

  const viewModel = useMemo(() => buildSubscriptionViewModel(settings), [settings]);
  const date = formatSubscriptionDate(settings?.premiumUntil);
  const heroSubtitle = t(viewModel.heroSubtitleKey, {
    defaultValue: viewModel.heroSubtitleDefault,
    date,
  });
  const readinessNote = t(viewModel.readinessKey, { defaultValue: viewModel.readinessDefault });

  const handlePrimaryPress = () => {
    Alert.alert(
      t('subscription.notReadyTitle', { defaultValue: 'Not ready yet' }),
      readinessNote,
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} translucent />

      {isReady && (
        <>
          <View style={styles.glowContainer} pointerEvents="none">
            <GlowCircle1 />
          </View>
          <View style={styles.glow2Container} pointerEvents="none">
            <GlowCircle2 />
          </View>
        </>
      )}

      <View style={[styles.headerRow, { paddingTop: insets.top + 16, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BackArrowIcon />
        </TouchableOpacity>
        <Text style={styles.title}>{t('subscription.screenTitle', { defaultValue: 'Subscription' })}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, styles[`${viewModel.accent}Hero`]]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.statusChip, styles[`${viewModel.accent}Chip`]]}>
              <Text style={[styles.statusChipText, styles[`${viewModel.accent}ChipText`]]}>
                {t(viewModel.chipKey, { defaultValue: viewModel.chipDefault })}
              </Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>
            {t(viewModel.heroTitleKey, { defaultValue: viewModel.heroTitleDefault })}
          </Text>
          <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>

          {viewModel.state === 'premium_active' && date && (
            <View style={styles.validityPill}>
              <Text style={styles.validityPillText}>
                {t('subscription.benefitsRemainUntil', {
                  defaultValue: 'Benefits available until {{date}}',
                  date,
                })}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.82} onPress={handlePrimaryPress}>
            <Text style={styles.primaryButtonText}>
              {t(viewModel.primaryButtonKey, { defaultValue: viewModel.primaryButtonDefault })}
            </Text>
          </TouchableOpacity>
          <Text style={styles.readinessNote}>{readinessNote}</Text>
        </View>

        <Text style={styles.sectionTitle}>
          {t(viewModel.benefitsTitleKey, { defaultValue: viewModel.benefitsTitleDefault })}
        </Text>

        <View style={styles.benefitsList}>
          {BENEFITS.map(({ Icon, titleKey, titleDefault, detailKey, detailDefault }) => (
            <View key={titleKey} style={styles.benefitRow}>
              <Icon />
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>{t(titleKey, { defaultValue: titleDefault })}</Text>
                <Text style={styles.benefitDetail}>{t(detailKey, { defaultValue: detailDefault })}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

// ═══════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glowContainer: {
    position: 'absolute',
    left: scale(22 + 175 - GLOW_RENDER_SIZE / 2),
    top: scale(-175 + 175 - GLOW_RENDER_SIZE / 2),
  },
  glow2Container: {
    position: 'absolute',
    left: scale(267.5 - GLOW2_RENDER_SIZE / 2),
    top: scale(-64.5 - GLOW2_RENDER_SIZE / 2),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  backButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    lineHeight: 26,
    color: colors.white[100],
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  heroCard: {
    minHeight: 276,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: 18,
    borderWidth: 1,
    marginBottom: 32,
  },
  neutralHero: {
    borderColor: 'rgba(255,255,255,0.08)',
  },
  premiumHero: {
    borderColor: 'rgba(23, 229, 108, 0.22)',
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  warningHero: {
    borderColor: 'rgba(250, 173, 20, 0.28)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 34,
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  neutralChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  premiumChip: {
    backgroundColor: 'rgba(23, 229, 108, 0.15)',
  },
  warningChip: {
    backgroundColor: 'rgba(250, 173, 20, 0.14)',
  },
  statusChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  neutralChipText: {
    color: colors.white[70],
  },
  premiumChipText: {
    color: colors.success[700],
  },
  warningChipText: {
    color: colors.warning[500],
  },
  heroTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 30,
    lineHeight: 36,
    color: colors.white[100],
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  heroSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.white[50],
    marginBottom: 18,
  },
  validityPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(23, 229, 108, 0.1)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 18,
  },
  validityPillText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
    color: colors.success[700],
  },
  primaryButton: {
    height: 56,
    backgroundColor: colors.white[100],
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
  },
  primaryButtonText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.background,
  },
  readinessNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
    color: colors.white[40],
    textAlign: 'center',
    marginTop: 12,
  },
  sectionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
    marginBottom: 12,
  },
  benefitsList: {
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  benefitCopy: {
    flex: 1,
    paddingTop: 1,
  },
  benefitTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white[100],
    marginBottom: 2,
  },
  benefitDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white[40],
  },
});
