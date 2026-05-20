/**
 * Castar — Home Screen
 *
 * Layout (from Figma):
 * ┌──────────────────────────────────────────────────┐
 * │  23 February                                      │
 * │  Hi, Nilats                                       │
 * │  ┌──────────────────────────────────────────┐    │
 * │  │  [MONTHLY BUDGET]                    ›   │    │
 * │  │  500,000$                                │    │
 * │  │  [1D] [7D*] [14D] [30D]                 │    │
 * │  │  ┌──────────┐ ┌────────────┐             │    │
 * │  │  │Spent    ›│ │Remaining  ›│             │    │
 * │  │  │-130.000$ │ │370.000$    │             │    │
 * │  │  └──────────┘ └────────────┘             │    │
 * │  └──────────────────────────────────────────┘    │
 * │                                                   │
 * │         [⊕ Add manually]  [🌀 Voice]             │
 * │  [Home*]  [Monitoring]  [Tasks]  [Profile]       │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  LayoutChangeEvent,
  Animated as RNAnimated,
  Dimensions,
  Pressable,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import Svg, { Path, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { format } from 'date-fns';
import { enUS, ru, uz, be, uk, kk, de, az, pl, ka, zhCN } from 'date-fns/locale';

import { colors, typography, spacing, borderRadius, fontFamily } from '../../../shared/constants';
import { scale, GLOW_RENDER_SIZE, GLOW2_RENDER_SIZE } from '../../../shared/constants/scaling';
import { GlowCircle1, GlowCircle2 } from '../../../shared/components/GlowImage';
// LogoIcon no longer needed — VoiceIcon defined locally below
import type { HomeStackParamList } from '../../../shared/types';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useRecurringStore } from '../../recurring/store/recurringStore';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency, formatAmount, getCurrencySymbol } from '../../../shared/utils/formatCurrency';
import * as budgetQueries from '../../../shared/services/database/budgetQueries';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { convertCurrency } from '../../../shared/services/currency/currencyService';
import * as Haptics from 'expo-haptics';
import { useTabBarVisibility } from '../../../core/navigation/tabBarVisibility';
import { buildInboxItems, summarizeInbox } from '../../tasks/utils/inboxEngine';

// Pure JS UUID v4 fallback (crypto.getRandomValues may be unavailable in old dev builds)
const generateUUID = (): string => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { uuid += '-'; }
    else if (i === 14) { uuid += '4'; }
    else if (i === 19) { uuid += hex[(Math.random() * 4 | 0) + 8]; }
    else { uuid += hex[Math.random() * 16 | 0]; }
  }
  return uuid;
};

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

type PeriodFilter = '1D' | '7D' | '14D' | '30D';

const PERIODS: PeriodFilter[] = ['1D', '7D', '14D', '30D'];

const PERIOD_DAYS: Record<PeriodFilter, number> = {
  '1D': 1,
  '7D': 7,
  '14D': 14,
  '30D': 30,
};

const PERIOD_NUMBERS: Record<PeriodFilter, string> = {
  '1D': '1',
  '7D': '7',
  '14D': '14',
  '30D': '30',
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ═══════════════════════════════════════════════
// Locale map for date-fns
// ═══════════════════════════════════════════════

const dateLocales: Record<string, typeof enUS> = {
  en: enUS,
  ru: ru,
  uz: uz,
  be: be,
  uk: uk,
  kk: kk,
  de: de,
  az: az,
  pl: pl,
  ka: ka,
  zh: zhCN,
};

// ═══════════════════════════════════════════════
// SVG Icons (JSX — no XML parsing at runtime)
// ═══════════════════════════════════════════════

const ChevronRightIcon = React.memo(({ size = 24, color = '#F6F6F6' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 5L15 12L9 19"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));
ChevronRightIcon.displayName = 'ChevronRightIcon';

const AddCircleIcon = React.memo(({ size = 24, color = '#F6F6F6' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12.75 9C12.75 8.58579 12.4142 8.25 12 8.25C11.5858 8.25 11.25 8.58579 11.25 9L11.25 11.25H9C8.58579 11.25 8.25 11.5858 8.25 12C8.25 12.4142 8.58579 12.75 9 12.75H11.25V15C11.25 15.4142 11.5858 15.75 12 15.75C12.4142 15.75 12.75 15.4142 12.75 15L12.75 12.75H15C15.4142 12.75 15.75 12.4142 15.75 12C15.75 11.5858 15.4142 11.25 15 11.25H12.75V9Z"
      fill={color}
    />
  </Svg>
));
AddCircleIcon.displayName = 'AddCircleIcon';

const NotificationIcon = React.memo(() => (
  <Svg width={28} height={28} viewBox="7 7.5 22 22" fill="none">
    <Path d="M14.9598 24.8682C15.6607 25.7592 16.7618 26.3333 18 26.3333C19.2382 26.3333 20.3393 25.7592 21.0402 24.8682C19.022 25.1416 16.978 25.1416 14.9598 24.8682Z" fill="white" />
    <Path d="M23.6243 15.5V16.0867C23.6243 16.7909 23.8252 17.4793 24.2018 18.0652L25.1247 19.501C25.9676 20.8124 25.3241 22.5949 23.858 23.0096C20.0227 24.0945 15.9773 24.0945 12.142 23.0096C10.6759 22.5949 10.0324 20.8124 10.8753 19.5009L11.7982 18.0652C12.1748 17.4793 12.3757 16.7909 12.3757 16.0867V15.5C12.3757 12.2783 14.8938 9.66666 18 9.66666C21.1062 9.66666 23.6243 12.2783 23.6243 15.5Z" fill="white" />
  </Svg>
));
NotificationIcon.displayName = 'NotificationIcon';

const CloseCircleIcon = React.memo(() => (
  <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
    <Circle cx={20} cy={20} r={16.6667} fill="white" fillOpacity={0.2} />
    <Path d="M24.1666 15.8333L15.8333 24.1666M15.8333 15.8333L24.1666 24.1666" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
));
CloseCircleIcon.displayName = 'CloseCircleIcon';

const BudgetIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.052 1.25H11.948C11.0495 1.24997 10.3003 1.24995 9.70552 1.32991C9.07773 1.41432 8.51093 1.59999 8.05546 2.05546C7.59999 2.51093 7.41432 3.07773 7.32991 3.70552C7.27259 4.13189 7.25637 5.15147 7.25179 6.02566C5.22954 6.09171 4.01536 6.32778 3.17157 7.17157C2 8.34315 2 10.2288 2 14C2 17.7712 2 19.6569 3.17157 20.8284C4.34314 22 6.22876 22 9.99998 22H14C17.7712 22 19.6569 22 20.8284 20.8284C22 19.6569 22 17.7712 22 14C22 10.2288 22 8.34315 20.8284 7.17157C19.9846 6.32778 18.7705 6.09171 16.7482 6.02566C16.7436 5.15147 16.7274 4.13189 16.6701 3.70552C16.5857 3.07773 16.4 2.51093 15.9445 2.05546C15.4891 1.59999 14.9223 1.41432 14.2945 1.32991C13.6997 1.24995 12.9505 1.24997 12.052 1.25ZM15.2479 6.00188C15.2434 5.15523 15.229 4.24407 15.1835 3.9054C15.1214 3.44393 15.0142 3.24644 14.8839 3.11612C14.7536 2.9858 14.5561 2.87858 14.0946 2.81654C13.6116 2.7516 12.964 2.75 12 2.75C11.036 2.75 10.3884 2.7516 9.90539 2.81654C9.44393 2.87858 9.24644 2.9858 9.11612 3.11612C8.9858 3.24644 8.87858 3.44393 8.81654 3.9054C8.771 4.24407 8.75661 5.15523 8.75208 6.00188C9.1435 6 9.55885 6 10 6H14C14.4412 6 14.8565 6 15.2479 6.00188ZM12 9.25C12.4142 9.25 12.75 9.58579 12.75 10V10.0102C13.8388 10.2845 14.75 11.143 14.75 12.3333C14.75 12.7475 14.4142 13.0833 14 13.0833C13.5858 13.0833 13.25 12.7475 13.25 12.3333C13.25 11.9493 12.8242 11.4167 12 11.4167C11.1758 11.4167 10.75 11.9493 10.75 12.3333C10.75 12.7174 11.1758 13.25 12 13.25C13.3849 13.25 14.75 14.2098 14.75 15.6667C14.75 16.857 13.8388 17.7155 12.75 17.9898V18C12.75 18.4142 12.4142 18.75 12 18.75C11.5858 18.75 11.25 18.4142 11.25 18V17.9898C10.1612 17.7155 9.25 16.857 9.25 15.6667C9.25 15.2525 9.58579 14.9167 10 14.9167C10.4142 14.9167 10.75 15.2525 10.75 15.6667C10.75 16.0507 11.1758 16.5833 12 16.5833C12.8242 16.5833 13.25 16.0507 13.25 15.6667C13.25 15.2826 12.8242 14.75 12 14.75C10.6151 14.75 9.25 13.7903 9.25 12.3333C9.25 11.143 10.1612 10.2845 11.25 10.0102V10C11.25 9.58579 11.5858 9.25 12 9.25Z"
      fill="white"
    />
  </Svg>
));
BudgetIcon.displayName = 'BudgetIcon';

const VoiceIcon = React.memo(({ size = 30 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="36 36 30 29" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M39.2565 44.145C42.4515 41.3727 47.1602 41.6369 50.7419 43.4272L52.2936 44.2973L50.5212 44.4828C47.5455 44.9795 44.5557 46.6743 42.443 48.9106C41.4792 49.9576 40.6938 51.161 40.2975 52.5082C39.2036 55.8141 40.5913 59.9704 43.8268 61.7953C43.9783 61.8674 44.13 61.9336 44.2848 61.9946C44.4257 62.0497 44.5694 62.0996 44.7145 62.145V62.1713C44.565 62.1299 44.4165 62.0842 44.2702 62.0336C44.1122 61.9786 43.9573 61.9182 43.8014 61.853C40.8343 60.3867 38.8496 56.9464 39.1208 53.4867C38.5892 52.9415 38.1157 52.3294 37.734 51.6547C36.8488 50.1551 36.5515 48.096 37.4206 46.4252C37.866 45.5269 38.5207 44.7785 39.2565 44.145ZM48.6364 43.7504C45.7122 42.7449 42.2436 42.8366 39.8688 44.8676C39.1934 45.4295 38.6145 46.0793 38.2272 46.8315C37.4875 48.2074 37.5339 49.9144 38.2116 51.4155C38.4612 51.9833 38.7865 52.5267 39.1686 53.0278C39.2037 52.7714 39.2501 52.515 39.3112 52.2602C39.6472 50.6843 40.4897 49.2522 41.5563 48.0961C43.5184 46.054 45.9136 44.5294 48.6364 43.7504Z"
      fill="white"
    />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M45.9478 49.4561C45.6574 52.4589 46.5201 55.7849 48.1333 58.4043C48.8952 59.6063 49.8544 60.6768 51.0533 61.4082C53.9633 63.3204 58.3369 63.0552 60.9371 60.4023C61.0459 60.2747 61.1497 60.1455 61.2486 60.0117C61.588 59.5507 61.8773 59.0413 62.0406 58.4902H62.0415C61.8818 59.0427 61.6056 59.5588 61.2828 60.0361C61.1887 60.1744 61.0903 60.3087 60.9869 60.4424C58.8027 62.9288 54.9654 63.9551 51.6939 62.7979C51.0296 63.1702 50.3155 63.4691 49.565 63.6631C47.8874 64.13 45.8221 63.884 44.4331 62.6123C43.6807 61.9496 43.1272 61.1237 42.7056 60.249C40.8546 56.4453 42.3285 51.965 44.9849 48.9688L46.2271 47.6953L45.9478 49.4561ZM44.7525 51.0869C43.0243 53.6513 42.2148 57.0252 43.5621 59.8447C43.93 60.6425 44.4074 61.3697 45.0337 61.9385C46.1713 63.0091 47.8322 63.4057 49.4576 63.1396C50.0707 63.0455 50.6802 62.8722 51.2632 62.6328C51.0245 62.5325 50.7886 62.4209 50.5581 62.2959C49.123 61.5635 47.9584 60.3792 47.1177 59.0498C45.653 56.626 44.8002 53.9186 44.7525 51.0869Z"
      fill="white"
    />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M63.5433 56.6812C60.3483 59.4534 55.6396 59.1892 52.0579 57.3989L50.5062 56.5288L52.2796 56.3433C55.2552 55.8465 58.2442 54.1517 60.3568 51.9155C61.3206 50.8685 62.106 49.6651 62.5023 48.3179C63.5962 45.012 62.2085 40.8557 58.973 39.0308C58.8215 38.9587 58.6698 38.8925 58.515 38.8315C58.3743 38.7765 58.2311 38.7265 58.0863 38.6812V38.6548C58.2355 38.6962 58.3836 38.742 58.5296 38.7925C58.6876 38.8475 58.8425 38.9079 58.9984 38.9731C61.9655 40.4394 63.9502 43.8797 63.679 47.3394C64.2106 47.8846 64.6841 48.4967 65.0658 49.1714C65.951 50.671 66.2483 52.7301 65.3792 54.4009C64.9338 55.2992 64.2791 56.0476 63.5433 56.6812ZM54.1634 57.0757C57.0876 58.0812 60.5562 57.9894 62.931 55.9585C63.6064 55.3966 64.1853 54.7468 64.5726 53.9946C65.3123 52.6187 65.2659 50.9118 64.5882 49.4106C64.3386 48.8428 64.0133 48.2994 63.6312 47.7983C63.5961 48.0547 63.5497 48.3111 63.4886 48.5659C63.1526 50.1418 62.3101 51.5739 61.2435 52.73C59.2814 54.7721 56.8862 56.2967 54.1634 57.0757Z"
      fill="white"
    />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M53.1172 37.137C54.7948 36.6702 56.8602 36.916 58.249 38.1877C59.0014 38.8504 59.555 39.6764 59.9766 40.551C61.8275 44.3546 60.3535 48.835 57.6973 51.8313L56.4551 53.1047L56.7344 51.344C57.0247 48.3413 56.162 45.0151 54.5488 42.3957C53.7869 41.1938 52.8277 40.1233 51.6289 39.3918C48.7189 37.4796 44.3453 37.745 41.7451 40.3977C41.6363 40.5253 41.5325 40.6546 41.4336 40.7883C41.0878 41.258 40.7933 41.778 40.6318 42.3411H40.6309C40.7891 41.7768 41.0704 41.2502 41.3994 40.7639C41.4934 40.6257 41.592 40.4912 41.6953 40.3577C43.8796 37.8713 47.7168 36.8448 50.9883 38.0022C51.6526 37.6299 52.3666 37.331 53.1172 37.137ZM57.6484 38.8616C56.5109 37.7909 54.8499 37.3944 53.2246 37.6604C52.6114 37.7545 52.0019 37.9278 51.4189 38.1672C51.6577 38.2676 51.8935 38.3791 52.124 38.5041C53.5592 39.2366 54.7238 40.4208 55.5645 41.7502C57.0291 44.1739 57.8819 46.8816 57.9297 49.7131C59.6577 47.1488 60.4673 43.7747 59.1201 40.9553C58.7522 40.1576 58.2747 39.4303 57.6484 38.8616Z"
      fill="white"
    />
  </Svg>
));
VoiceIcon.displayName = 'VoiceIcon';

// ═══════════════════════════════════════════════
// Streak Grid Component (7 cells per row = week)
// ═══════════════════════════════════════════════

const GRID_COLS = 7;
const GRID_CELL_GAP = 3;

const StreakGrid = React.memo(({ activeDays }: { activeDays: boolean[] }) => {
  const [cellSize, setCellSize] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setCellSize(Math.floor((w - (GRID_COLS - 1) * GRID_CELL_GAP) / GRID_COLS));
    }
  }, []);

  return (
    <View style={streakGridStyles.grid} onLayout={handleLayout}>
      {cellSize > 0 && activeDays.map((active, i) => (
        <View
          key={i}
          style={[
            { width: cellSize, height: cellSize, borderRadius: 4 },
            active ? streakGridStyles.cellActive : streakGridStyles.cellInactive,
          ]}
        />
      ))}
    </View>
  );
});
StreakGrid.displayName = 'StreakGrid';

const streakGridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_CELL_GAP,
  },
  cellActive: {
    backgroundColor: colors.success[700],
  },
  cellInactive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

// ═══════════════════════════════════════════════
// HomeScreen Component
// ═══════════════════════════════════════════════

export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  // ── State ──
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('1D');
  const [pillWidth, setPillWidth] = useState(0);

  // ── Animated period indicator ──
  const selectedIndex = PERIODS.indexOf(selectedPeriod);
  const indicatorX = useSharedValue(selectedIndex * (pillWidth + 4));

  useEffect(() => {
    indicatorX.value = withTiming(selectedIndex * (pillWidth + 4), {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [selectedIndex, pillWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const handlePillLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== pillWidth) setPillWidth(w);
  }, [pillWidth]);

  // ── Tab bar visibility (hide during modals — no unmount, just opacity) ──
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);

  // ── Store data ──
  const { displayName, userId } = useAuthStore(useShallow((s) => ({ displayName: s.displayName, userId: s.userId })));
  const currency = useProfileStore(useShallow((s) => s.currency));
  const budgets = useBudgetStore(useShallow((s) => s.budgets));
  const addBudget = useBudgetStore((s) => s.addBudget);
  const updateBudgetInStore = useBudgetStore((s) => s.updateBudget);
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));

  // ── Derived data ──
  const now = new Date();
  const locale = dateLocales[i18n.language] || enUS;
  const dayNumber = format(now, 'd');
  const monthNameRaw = format(now, 'MMMM', { locale });
  const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

  const activeBudget = useMemo(
    () => budgets.find((b) => b.isActive && b.period === 'monthly') ?? null,
    [budgets],
  );

  const spent = useMemo(() => {
    if (!activeBudget) return 0;
    const days = PERIOD_DAYS[selectedPeriod];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return transactions
      .filter((t) => t.type === 'expense' && t.date >= cutoff)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, selectedPeriod, activeBudget]);

  const budgetAmount = activeBudget?.amount ?? 0;
  const remaining = budgetAmount - spent;

  const monthStart = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, []);

  const monthlySnapshot = useMemo(() => {
    const monthTransactions = transactions.filter((tx) => tx.date >= monthStart);
    const income = monthTransactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expense = monthTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const byCategory = monthTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce<Record<string, number>>((acc, tx) => {
        acc[tx.categoryId] = (acc[tx.categoryId] ?? 0) + tx.amount;
        return acc;
      }, {});

    const topCategoryEntry = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    const topCategory = topCategoryEntry
      ? categories.find((category) => category.id === topCategoryEntry[0])
      : undefined;

    return {
      income,
      expense,
      net: income - expense,
      topCategoryName: topCategory
        ? (topCategory.name.startsWith('categories.') ? t(topCategory.name) : topCategory.name)
        : '—',
      topCategoryAmount: topCategoryEntry?.[1] ?? 0,
    };
  }, [categories, monthStart, t, transactions]);

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date - a.date).slice(0, 3),
    [transactions],
  );

  const periodExpenseTransactions = useMemo(() => {
    const days = PERIOD_DAYS[selectedPeriod];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return transactions.filter((tx) => tx.type === 'expense' && tx.date >= cutoff);
  }, [selectedPeriod, transactions]);

  const categorySegments = useMemo(() => {
    const totals = periodExpenseTransactions.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.categoryId] = (acc[tx.categoryId] ?? 0) + tx.amount;
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([categoryId, amount]) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          categoryId,
          amount,
          name: category
            ? (category.name.startsWith('categories.') ? t(category.name) : category.name)
            : 'Other',
          color: category?.color || '#A3E635',
          icon: category?.icon || '•',
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [categories, periodExpenseTransactions, t]);

  const budgetSpentPercent = budgetAmount > 0 ? Math.min(100, Math.round((spent / budgetAmount) * 100)) : 0;

  const formatTransactionTime = useCallback((timestamp: number) => {
    const txDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a: Date, b: Date) => (
      a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
    );

    if (isSameDay(txDate, today)) return format(txDate, 'HH:mm');
    if (isSameDay(txDate, yesterday)) return 'Yesterday';
    return format(txDate, 'd MMM', { locale });
  }, [locale]);

  // ── Auto-convert budget when profile currency changes ──
  const prevCurrencyRef = useRef(currency);
  useEffect(() => {
    const prev = prevCurrencyRef.current;
    prevCurrencyRef.current = currency;

    if (prev === currency || !activeBudget || activeBudget.currency === currency) return;

    (async () => {
      try {
        const converted = await convertCurrency(activeBudget.amount, activeBudget.currency, currency);
        const rounded = Math.round(converted);
        const ts = Date.now();
        const patch = { amount: rounded, currency, updatedAt: ts };
        const updatedBudget = { ...activeBudget, ...patch };
        budgetQueries.update(activeBudget.id, patch);
        updateBudgetInStore(activeBudget.id, patch);
        syncService.queueChange('budgets', activeBudget.id, 'update', updatedBudget).catch(() => {});
        const auditLog = auditLogQueries.record({
          userId: activeBudget.userId,
          entityType: 'budgets',
          entityId: activeBudget.id,
          action: 'update',
          before: activeBudget,
          after: updatedBudget,
          source: 'home_budget_currency_conversion',
        });
        syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog).catch(() => {});
      } catch {
        // Conversion failed (offline, rate not found) — keep old amount
      }
    })();
  }, [currency, activeBudget, updateBudgetInStore]);

  // ── Streak grid: days in the current month (1 cell = 1 day, single line) ──
  const streakData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = today.getDate(); // 1-based

    const days: boolean[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      if (day > todayDate) {
        // Future days — inactive
        days.push(false);
      } else {
        const dayStart = new Date(year, month, day);
        const dayStartMs = dayStart.getTime();
        const dayEndMs = dayStartMs + 86_400_000;
        days.push(
          transactions.some((tx) => tx.date >= dayStartMs && tx.date < dayEndMs),
        );
      }
    }

    // Consecutive streak count (from today backwards)
    let streakCount = 0;
    for (let i = todayDate - 1; i >= 0; i--) {
      if (days[i]) streakCount++;
      else break;
    }
    return { days, streakCount };
  }, [transactions]);

  // ── Inbox: derived unresolved finance decisions (no AI/API calls) ──
  const debts = useMemo(() => {
    if (!userId) return [];
    try { return debtQueries.findByUser(userId); } catch { return []; }
  }, [userId]);
  const inboxSummary = useMemo(() => summarizeInbox(buildInboxItems({
    transactions,
    categories,
    budgets,
    recurrings,
    debts,
    currency,
  })), [budgets, categories, currency, debts, recurrings, transactions]);
  const openInbox = useCallback(() => {
    navigation.dispatch(CommonActions.navigate({ name: 'TasksTab', params: { screen: 'Tasks' } }));
  }, [navigation]);

  // ── Budget modal state ──
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetAmountInput, setBudgetAmountInput] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetFieldFocused, setBudgetFieldFocused] = useState(false);

  // ── Budget modal animation values (same pattern as ProfileScreen picker) ──
  const budgetOverlayOpacity = useRef(new RNAnimated.Value(0)).current;
  const budgetSheetTranslateY = useRef(new RNAnimated.Value(SCREEN_HEIGHT)).current;
  const budgetInputRef = useRef<TextInput>(null);

  // Track keyboard — animate buttons above keyboard (1:1 ProfileScreen pattern)
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const budgetBtnTranslateY = useSharedValue(0);
  const budgetBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: budgetBtnTranslateY.value }],
  }));
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        const kbHeight = e.endCoordinates.height;
        budgetBtnTranslateY.value = withSpring(-(kbHeight - 8), { damping: 20, stiffness: 150, mass: 0.8 });
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        budgetBtnTranslateY.value = withSpring(0, { damping: 20, stiffness: 150, mass: 0.8 });
      },
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [budgetBtnTranslateY]);

  // Format number with dot thousand separators: 500000 → 500.000
  const formatAmountWithDots = useCallback((text: string): string => {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }, []);

  // ── Handlers ──
  const handlePeriodPress = useCallback((period: PeriodFilter) => {
    setSelectedPeriod(period);
  }, []);

  const handleAddManually = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  // Budget open/close animations
  const startBudgetAnimation = useCallback(() => {
    RNAnimated.parallel([
      RNAnimated.timing(budgetOverlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      RNAnimated.spring(budgetSheetTranslateY, {
        toValue: 0,
        damping: 28,
        stiffness: 220,
        mass: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [budgetOverlayOpacity, budgetSheetTranslateY]);

  const handleBudgetCardPress = useCallback(() => {
    setBudgetAmountInput(activeBudget ? formatAmountWithDots(String(activeBudget.amount)) : '');
    budgetSheetTranslateY.setValue(SCREEN_HEIGHT);
    budgetOverlayOpacity.setValue(0);
    setBudgetFieldFocused(false);
    setTabBarHidden(true);
    setShowBudgetModal(true);
    // Animation deferred to onShow callback (Modal pattern from ProfileScreen)
  }, [activeBudget, budgetOverlayOpacity, budgetSheetTranslateY, formatAmountWithDots, setTabBarHidden]);

  const handleCloseBudgetModal = useCallback(() => {
    Keyboard.dismiss();
    RNAnimated.parallel([
      RNAnimated.timing(budgetOverlayOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      RNAnimated.timing(budgetSheetTranslateY, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowBudgetModal(false);
      setTabBarHidden(false);
    });
  }, [budgetOverlayOpacity, budgetSheetTranslateY, setTabBarHidden]);

  const handleSaveBudget = useCallback(async () => {
    const num = parseFloat(budgetAmountInput.replace(/\./g, ''));
    if (isNaN(num) || num <= 0) return;
    setIsSavingBudget(true);
    const now = Date.now();
    try {
      if (activeBudget) {
        const patch = { amount: num, updatedAt: now };
        const updatedBudget = { ...activeBudget, ...patch };
        budgetQueries.update(activeBudget.id, patch);
        updateBudgetInStore(activeBudget.id, patch);
        await syncService.queueChange('budgets', activeBudget.id, 'update', updatedBudget);
        const auditLog = auditLogQueries.record({
          userId: activeBudget.userId,
          entityType: 'budgets',
          entityId: activeBudget.id,
          action: 'update',
          before: activeBudget,
          after: updatedBudget,
          source: 'home_budget_modal',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      } else {
        const id = generateUUID();
        const budgetData = {
          id,
          userId: userId || '',
          name: t('home.monthlyBudget'),
          amount: num,
          currency,
          period: 'monthly' as const,
          startDate: now,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        budgetQueries.insert(budgetData);
        addBudget(budgetData);
        await syncService.queueChange('budgets', budgetData.id, 'create', budgetData);
        const auditLog = auditLogQueries.record({
          userId: budgetData.userId,
          entityType: 'budgets',
          entityId: budgetData.id,
          action: 'create',
          after: budgetData,
          source: 'home_budget_modal',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      }
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      handleCloseBudgetModal();
    } catch (e: any) {
      console.error('Save budget failed:', e?.message || e);
    } finally {
      setIsSavingBudget(false);
    }
  }, [budgetAmountInput, activeBudget, userId, currency, t, updateBudgetInStore, addBudget, handleCloseBudgetModal]);

  const handleVoicePress = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  // ═══════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Background Glows (GPU-accelerated PNG) ── */}
      <View style={styles.glowContainer} pointerEvents="none">
        <GlowCircle1 />
      </View>
      <View style={styles.glow2Container} pointerEvents="none">
        <GlowCircle2 />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: (Date + Greeting) + Notification ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerTexts}>
            <View style={styles.dateRow}>
              <Text style={styles.dayNumber}>{dayNumber}</Text>
              <Text style={styles.monthName}>{' '}{monthName}</Text>
            </View>
            <Text style={styles.greeting}>
              {t('home.greeting')}, {displayName || t('profile.guest')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.7}
            onPress={() => {/* TODO: open notifications */}}
          >
            <NotificationIcon />
          </TouchableOpacity>
        </View>

        {/* ── Budget Card ── */}
        <TouchableOpacity style={styles.budgetCard} onPress={handleBudgetCardPress} activeOpacity={0.82}>
          <View style={styles.budgetHeader}>
            <View style={styles.budgetBadge}>
              <Text style={styles.budgetBadgeText}>{t('home.remainder')}</Text>
            </View>
            <ChevronRightIcon size={24} />
          </View>

          <Text style={styles.budgetTotalAmount}>{formatCurrency(budgetAmount, currency)}</Text>
          <Text style={styles.budgetRemainderAmount}>
            {formatCurrency(remaining >= 0 ? remaining : 0, currency)}
          </Text>
          <Text style={styles.budgetSpentCaption}>
            {budgetSpentPercent}% {t('home.budgetSpentCaption')}
          </Text>

          <View style={styles.categoryBar}>
            {categorySegments.length > 0 ? (
              categorySegments.map((segment, index) => {
                const width = spent > 0 ? Math.max(12, (segment.amount / spent) * 100) : 20;
                return (
                  <View
                    key={segment.categoryId}
                    style={[
                      styles.categoryBarSegment,
                      {
                        width: `${Math.min(width, 100)}%`,
                        backgroundColor: segment.color,
                        marginLeft: index === 0 ? 0 : -10,
                        zIndex: categorySegments.length - index,
                      },
                    ]}
                  />
                );
              })
            ) : (
              <View style={styles.categoryBarEmpty} />
            )}
          </View>

          <View style={styles.categoryLegend}>
            {categorySegments.length > 0 ? categorySegments.map((segment) => (
              <View key={segment.categoryId} style={styles.categoryLegendItem}>
                <View style={[styles.categoryLegendDot, { backgroundColor: segment.color }]} />
                <Text style={styles.categoryLegendText} numberOfLines={1}>
                  {segment.name}
                </Text>
              </View>
            )) : (
              <Text style={styles.categoryLegendEmpty}>{t('home.noSpendingYet')}</Text>
            )}
          </View>

          <View style={styles.periodContainer}>
            {pillWidth > 0 && (
              <Animated.View
                style={[
                  styles.periodIndicator,
                  { width: pillWidth, height: 35 },
                  indicatorStyle,
                ]}
              />
            )}
            {PERIODS.map((period, index) => {
              const isActive = period === selectedPeriod;
              return (
                <TouchableOpacity
                  key={period}
                  style={styles.periodPill}
                  onPress={() => handlePeriodPress(period)}
                  onLayout={index === 0 ? handlePillLayout : undefined}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.periodPillText, isActive && styles.periodPillTextActive]}>
                    {PERIOD_NUMBERS[period]}{t('home.dayShort')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>

        {/* ── Latest Transactions ── */}
        <TouchableOpacity
          style={styles.latestTransactionsCard}
          onPress={() => navigation.navigate('Transactions')}
          activeOpacity={0.86}
        >
          <View style={styles.latestHeader}>
            <Text style={styles.latestEyebrow}>{t('home.latestTransactions')}</Text>
            <ChevronRightIcon size={22} />
          </View>

          {recentTransactions.length > 0 ? (
            <View style={styles.latestList}>
              {recentTransactions.map((transaction) => {
                const category = categories.find((item) => item.id === transaction.categoryId);
                const categoryName = category
                  ? (category.name.startsWith('categories.') ? t(category.name) : category.name)
                  : 'Other';
                const isIncome = transaction.type === 'income';

                return (
                  <TouchableOpacity
                    key={transaction.id}
                    style={styles.latestRow}
                    onPress={() => navigation.navigate('TransactionDetail', { transactionId: transaction.id })}
                    activeOpacity={0.72}
                  >
                    <View style={[styles.latestIcon, { backgroundColor: `${category?.color || '#FFFFFF'}22` }]}>
                      <Text style={styles.latestIconText}>{category?.icon || (isIncome ? '↗' : '↘')}</Text>
                    </View>
                    <View style={styles.latestTextBlock}>
                      <Text style={styles.latestTitle} numberOfLines={1}>
                        {transaction.description || categoryName}
                      </Text>
                      <Text style={styles.latestSubtitle} numberOfLines={1}>
                        {categoryName}
                      </Text>
                    </View>
                    <View style={styles.latestAmountBlock}>
                      <Text style={isIncome ? styles.latestIncome : styles.latestExpense}>
                        {isIncome ? '+' : '-'}{formatAmount(transaction.amount, transaction.currency)} {getCurrencySymbol(transaction.currency)}
                      </Text>
                      <Text style={styles.latestTime}>{formatTransactionTime(transaction.date)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.latestEmpty}>
              <Text style={styles.latestEmptyTitle}>{t('transactions.noTransactions')}</Text>
              <Text style={styles.latestEmptySubtitle}>{t('home.addTransaction')}</Text>
            </View>
          )}
        </TouchableOpacity>


        {/* ── Streak + Tasks Row ── */}
        <View style={styles.infoCardsRow}>
          {/* Streak */}
          <View style={[styles.infoCard, { width: 186, alignSelf: 'flex-start' }]}>
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>{t('home.streakLabel')}</Text>
            </View>
            <StreakGrid activeDays={streakData.days} />
          </View>

          {/* Inbox */}
          <TouchableOpacity style={styles.infoCard} activeOpacity={0.78} onPress={openInbox}>
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>INBOX</Text>
            </View>
            <View style={styles.taskCenter}>
              <Text style={styles.taskBigValue}>{inboxSummary.total}</Text>
              <Text style={styles.taskSubtext}>{inboxSummary.total === 0 ? 'clean' : 'open'}</Text>
            </View>
            <View style={styles.taskStatsRow}>
              <View style={styles.taskStat}>
                <View style={[styles.taskStatBar, { backgroundColor: colors.error[400], boxShadow: '0 0 24px 2px rgba(245, 88, 88, 0.5)' }]} />
                <View style={styles.taskStatTexts}>
                  <Text style={styles.taskStatLabel}>Critical</Text>
                  <Text style={styles.taskStatCount}>{inboxSummary.critical}</Text>
                </View>
              </View>
              <View style={styles.taskStat}>
                <View style={[styles.taskStatBar, { backgroundColor: colors.warning[500], boxShadow: '0 0 24px 2px rgba(250, 173, 20, 0.5)' }]} />
                <View style={styles.taskStatTexts}>
                  <Text style={styles.taskStatLabel}>Warning</Text>
                  <Text style={styles.taskStatCount}>{inboxSummary.warning}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Floating Bottom Actions ── */}
      <View style={[styles.bottomActions, { bottom: 32 }]}>
        <TouchableOpacity
          style={styles.addManuallyButton}
          onPress={handleAddManually}
          activeOpacity={0.7}
        >
          <AddCircleIcon size={24} />
          <Text style={styles.addManuallyText}>{t('home.addManually')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.voiceButton}
          onPress={handleVoicePress}
          activeOpacity={0.7}
        >
          <View style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 60 60">
              <Defs>
                <RadialGradient id="vbGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="white" stopOpacity="0" />
                  <Stop offset="0.8" stopColor="white" stopOpacity="0.15" />
                  <Stop offset="1" stopColor="white" stopOpacity="0.25" />
                </RadialGradient>
              </Defs>
              <Circle cx="30" cy="30" r="30" fill="url(#vbGlow)" />
            </Svg>
          </View>
          <Image
            source={require('../../../assets/images/noise.png')}
            style={styles.voiceNoise}
          />
          <VoiceIcon size={34} />
        </TouchableOpacity>
      </View>

      {/* ── Budget Amount Modal (same pattern as ProfileScreen picker) ── */}
      <Modal visible={showBudgetModal} transparent animationType="none" statusBarTranslucent onShow={startBudgetAnimation}>
        <View style={styles.budgetOverlayRoot} pointerEvents="auto">
        {/* Animated blur + tint backdrop */}
        <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: budgetOverlayOpacity }]} pointerEvents="none">
          <BlurView
            intensity={10}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.budgetOverlayTint} pointerEvents="none" />
        </RNAnimated.View>

        {/* Tap outside sheet to close */}
        <Pressable
          style={styles.budgetOverlayDismiss}
          onPress={handleCloseBudgetModal}
        />

        {/* Animated Sheet — slides up from bottom */}
        <RNAnimated.View
          style={[
            styles.budgetModalSheet,
            { paddingBottom: insets.bottom + 24, transform: [{ translateY: budgetSheetTranslateY }] },
          ]}
        >
          {/* Header: icon + title + close */}
          <View style={styles.budgetModalHeader}>
            <View style={styles.budgetModalHeaderLeft}>
              <BudgetIcon />
              <Text style={styles.budgetModalTitle}>
                {activeBudget ? t('budget.editBudget') : t('budget.createBudget')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.budgetModalCloseBtn}
              onPress={handleCloseBudgetModal}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CloseCircleIcon />
            </TouchableOpacity>
          </View>

          {/* Field */}
          <View style={[styles.budgetSettingsField, budgetFieldFocused && styles.budgetSettingsFieldFocused]}>
            <View style={styles.budgetSettingsFieldTexts}>
              <Text style={styles.budgetSettingsLabel}>{t('budget.budget')}</Text>
              <TextInput
                ref={budgetInputRef}
                style={styles.budgetSettingsInput}
                value={budgetAmountInput}
                onChangeText={(text) => setBudgetAmountInput(formatAmountWithDots(text))}
                onFocus={() => setBudgetFieldFocused(true)}
                onBlur={() => setBudgetFieldFocused(false)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.white[20]}
                selectionColor={colors.white[70]}
              />
            </View>
          </View>

          {/* Spacer pushes buttons to bottom */}
          <View style={{ flex: 1 }} />

          {/* Buttons: Back + Save */}
          <Animated.View style={[styles.budgetEditButtons, budgetBtnAnimStyle]}>
            <TouchableOpacity
              style={styles.budgetCancelBtn}
              onPress={handleCloseBudgetModal}
              activeOpacity={0.8}
            >
              <Text style={styles.budgetCancelBtnText}>{t('common.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.budgetSaveBtn,
                (!budgetAmountInput || parseFloat(budgetAmountInput.replace(/\./g, '')) <= 0) && styles.budgetSaveBtnDisabled,
              ]}
              onPress={handleSaveBudget}
              activeOpacity={0.8}
              disabled={!budgetAmountInput || parseFloat(budgetAmountInput.replace(/\./g, '')) <= 0 || isSavingBudget}
            >
              <Text style={styles.budgetSaveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </RNAnimated.View>
        </View>
      </Modal>
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

  // ── Background Glows ──
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

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: 24,
    paddingBottom: 160,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTexts: {
    flex: 1,
    marginRight: 12,
    gap: 6,
  },

  // ── Date ──
  dateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },

  // ── Notification button (copied from ProfileScreen actionButton) ──
  notificationButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumber: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  monthName: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textTertiary,
    flexShrink: 0,
  },

  // ── Greeting ──
  greeting: {
    fontFamily: fontFamily.medium,
    fontSize: 40,
    lineHeight: 40,
    color: colors.text,
  },

  // ── Budget Card ──
  budgetCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: spacing.md,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  budgetBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  budgetBadgeText: {
    ...typography.captionMedium,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Budget Amount ──
  budgetAmount: {
    fontFamily: fontFamily.medium,
    fontSize: 36,
    lineHeight: 36,
    color: colors.text,
    marginBottom: 24,
  },

  // ── Period Pills ──
  periodContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: 6,
  },
  periodPill: {
    flex: 1,
    height: 35,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  periodPillActive: {},
  periodPillText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.textTertiary,
  },
  periodPillTextActive: {
    fontFamily: fontFamily.medium,
    color: colors.text,
  },

  // ── Sub Cards (1:1 settingsField from ProfileScreen) ──
  subCardsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  subCard: {
    flex: 1,
    height: 62,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  subCardTexts: {
    flex: 1,
    gap: 6,
    marginRight: 8,
  },
  subCardLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
  },
  subCardValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  subCardValueSpent: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: '#FF5151',
    flexShrink: 1,
  },
  subCardSymbolSpent: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: '#FF5151',
  },
  subCardValueCredited: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: '#3BD57C',
    flexShrink: 1,
  },
  subCardSymbolCredited: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: '#3BD57C',
  },

  // ── Monthly Value Loop ──
  valueLoopCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginTop: 6,
    gap: spacing.md,
  },
  valueLoopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  valueLoopTitle: {
    ...typography.bodyLargeMedium,
    color: colors.text,
  },
  valueLoopMuted: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  valueLoopStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  valueLoopStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  valueLoopLabel: {
    ...typography.caption,
    color: colors.white[40],
  },
  valueLoopIncome: {
    ...typography.bodyMedium,
    color: '#3BD57C',
  },
  valueLoopExpense: {
    ...typography.bodyMedium,
    color: '#FF5151',
  },
  valueLoopDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  valueLoopBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  valueLoopRightAligned: {
    flex: 1,
    alignItems: 'flex-end',
  },
  valueLoopTopCategory: {
    ...typography.bodyMedium,
    color: colors.text,
    maxWidth: 170,
    textAlign: 'right',
  },
  recentList: {
    gap: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  recentTextBlock: {
    flex: 1,
    gap: 3,
  },
  recentTitle: {
    ...typography.smallMedium,
    color: colors.text,
  },
  recentSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  recentIncome: {
    ...typography.smallMedium,
    color: '#3BD57C',
  },
  recentExpense: {
    ...typography.smallMedium,
    color: '#FF5151',
  },

  budgetTotalAmount: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
    lineHeight: 26,
    color: colors.white[50],
    marginTop: -8,
    marginBottom: 4,
  },
  budgetRemainderAmount: {
    fontFamily: fontFamily.medium,
    fontSize: 42,
    lineHeight: 46,
    color: colors.text,
    marginBottom: 8,
  },
  budgetSpentCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white[50],
    marginBottom: 16,
  },
  categoryBar: {
    height: 36,
    borderRadius: 18,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  categoryBarSegment: {
    height: 36,
    borderRadius: 18,
  },
  categoryBarEmpty: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  categoryLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '48%',
  },
  categoryLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  categoryLegendText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 15,
    color: colors.white[50],
  },
  categoryLegendEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
    color: colors.white[40],
  },
  latestTransactionsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginTop: 6,
  },
  latestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  latestEyebrow: {
    ...typography.captionMedium,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  latestList: {
    gap: 10,
  },
  latestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
  },
  latestIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestIconText: {
    fontSize: 20,
  },
  latestTextBlock: {
    flex: 1,
    gap: 3,
  },
  latestTitle: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  latestSubtitle: {
    ...typography.caption,
    color: colors.white[40],
  },
  latestAmountBlock: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: 110,
  },
  latestIncome: {
    ...typography.smallMedium,
    color: '#3BD57C',
  },
  latestExpense: {
    ...typography.smallMedium,
    color: '#FF5151',
  },
  latestTime: {
    ...typography.caption,
    color: colors.white[40],
  },
  latestEmpty: {
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
    gap: 4,
  },
  latestEmptyTitle: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  latestEmptySubtitle: {
    ...typography.caption,
    color: colors.white[40],
  },

  // ── Info Cards (Streak + Tasks) ──
  infoCardsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  infoBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  infoBadgeText: {
    ...typography.captionMedium,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  taskBigValue: {
    fontFamily: fontFamily.medium,
    fontSize: 40,
    lineHeight: 40,
    color: colors.white[100],
  },
  taskSubtext: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[40],
    marginTop: 4,
  },
  taskStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskStat: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  taskStatTexts: {
    gap: 4,
  },
  taskStatBar: {
    width: 2,
    borderRadius: 1,
  },
  taskStatLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.white[40],
  },
  taskStatCount: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
  },

  // ── Bottom Actions ──
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  addManuallyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral[800],
    borderRadius: borderRadius.full,
    paddingLeft: 12,
    paddingRight: 14,
    height: 60,
  },
  addManuallyText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
  },
  voiceButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.success[700],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(98, 214, 147, 0.33)',
    boxShadow: '0 0 25px 0 rgba(10, 203, 91, 0.5)',
    overflow: 'hidden',
  },
  voiceNoise: {
    ...StyleSheet.absoluteFillObject,
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.5,
  },

  // ── Budget Modal (1:1 ProfileScreen picker overlay) ──
  budgetOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  budgetOverlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 16, 16, 0.5)',
  },
  budgetOverlayDismiss: {
    flex: 1,
  },
  budgetModalSheet: {
    backgroundColor: colors.neutral[900],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '75%',
    gap: 16,
  },
  // Header (1:1 ProfileScreen modalHeader)
  budgetModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetModalHeaderLeft: {
    gap: 12,
    flex: 1,
  },
  budgetModalCloseBtn: {
    marginLeft: 12,
  },
  budgetModalTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: 32,
    color: colors.white[100],
  },
  // Field (1:1 settingsField from ProfileScreen)
  budgetSettingsField: {
    height: 62,
    backgroundColor: colors.neutral[850],
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  budgetSettingsFieldFocused: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
  budgetSettingsFieldTexts: {
    flex: 1,
    gap: 4,
    marginRight: 8,
  },
  budgetSettingsLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
  },
  budgetSettingsInput: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
    padding: 0,
    margin: 0,
    minHeight: 0,
    height: 20,
  },
  // Buttons (1:1 settingsEditButtons from ProfileScreen)
  budgetEditButtons: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: 6,
  },
  budgetCancelBtn: {
    height: 51,
    backgroundColor: 'rgba(246, 246, 246, 0.05)',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  budgetCancelBtnText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
    textAlign: 'center',
  },
  budgetSaveBtn: {
    height: 51,
    backgroundColor: colors.white[100],
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  budgetSaveBtnDisabled: {
    opacity: 0.5,
  },
  budgetSaveBtnText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.neutral[950],
    textAlign: 'center',
  },
});
