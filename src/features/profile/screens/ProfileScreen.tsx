/**
 * Castar — Profile Screen
 *
 * Layout (from Figma screenshot):
 * ┌──────────────────────────────────────────────────┐
 * │  Name (32px medium)           [Settings][Exit]   │
 * │  auth method (16px regular, 40% white)           │
 * ├──────────────────────────────────────────────────┤
 * │  [Currency 🇺🇿 UZS  >]  [Language 🇺🇿 O'zbek >]│
 * ├──────────────────────────────────────────────────┤
 * │  Other sections                                   │
 * │  🔔 Notifications    We promise not to spam  [⬤] │
 * │  💳 Subscription mgmt   No active            [>] │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  ScrollView,
  Pressable,
  BackHandler,
  TextInput,
  Keyboard,
  Linking,
  Platform,
  Modal,
} from 'react-native';
import Reanimated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Biometric from '../../../shared/services/biometric';
import WebView from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { GlowCircle1, GlowCircle2 } from '../../../shared/components/GlowImage';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, fontFamily, grid, borderRadius } from '../../../shared/constants';
import type { ProfileStackParamList } from '../../../shared/types';
import {
  getTelegramAuthUrl,
  isAuthCallback,
  parseAuthCallback,
  persistLinkedTelegram,
  getLinkedTelegram,
  persistLinkedPhone,
  getLinkedPhone,
  persistLinkedEmail,
  getLinkedEmail,
} from '../../auth/services/telegramAuth';
import { sendVerificationCode, verifyEmailCode } from '../../auth/services/emailAuth';
import { sendPhoneVerificationCode, verifyPhoneCode } from '../../auth/services/phoneAuth';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../store/profileStore';
import { getRatesFromUSD } from '../../../shared/services/currency/currencyService';
import { useSettings } from '../../../shared/services/api/hooks/useSettings';
import { useTabBarVisibility } from '../../../core/navigation/tabBarVisibility';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Figma frame = 393px
const FIGMA_WIDTH = 393;
const scale = (v: number) => (v / FIGMA_WIDTH) * SCREEN_WIDTH;

// Glow positioning constants (GlowCircle1/GlowCircle2 imported from GlowImage)
const GLOW_RENDER_SIZE = 1050;
const GLOW2_RENDER_SIZE = 477;

// ═══════════════════════════════════════════════
// SVG Icons (JSX — no XML parsing at runtime)
// ═══════════════════════════════════════════════

const SettingsIcon = React.memo(({ size = 28 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <Path fillRule="evenodd" clipRule="evenodd" d="M16.6586 2.51094C16.2265 2.33333 15.6788 2.33333 14.5833 2.33333C13.4879 2.33333 12.9401 2.33333 12.5081 2.51094C11.932 2.74776 11.4743 3.202 11.2357 3.77373C11.1267 4.03473 11.0841 4.33825 11.0674 4.78098C11.0429 5.43162 10.7067 6.03387 10.1385 6.35941C9.57037 6.68495 8.87674 6.67279 8.29673 6.36855C7.90204 6.16151 7.61587 6.04639 7.33365 6.00951C6.71544 5.92874 6.09021 6.095 5.59552 6.47173C5.22449 6.75427 4.95062 7.22504 4.40289 8.16658C3.85515 9.10812 3.58128 9.57889 3.52024 10.0391C3.43885 10.6526 3.60638 11.2731 3.98597 11.7641C4.15923 11.9881 4.40274 12.1765 4.78065 12.4122C5.33623 12.7586 5.69371 13.3488 5.69367 14C5.69364 14.6511 5.33618 15.2412 4.78065 15.5877C4.40267 15.8233 4.15913 16.0117 3.98586 16.2359C3.60626 16.7268 3.43873 17.3473 3.52012 17.9609C3.58117 18.421 3.85503 18.8918 4.40277 19.8333C4.95051 20.7749 5.22438 21.2456 5.5954 21.5282C6.0901 21.9049 6.71532 22.0712 7.33354 21.9904C7.61574 21.9535 7.9019 21.8384 8.29655 21.6314C8.87661 21.3271 9.57028 21.315 10.1385 21.6405C10.7067 21.9661 11.0429 22.5684 11.0674 23.2191C11.0841 23.6618 11.1267 23.9653 11.2357 24.2263C11.4743 24.798 11.932 25.2522 12.5081 25.489C12.9401 25.6667 13.4879 25.6667 14.5833 25.6667C15.6788 25.6667 16.2265 25.6667 16.6586 25.489C17.2347 25.2522 17.6924 24.798 17.931 24.2263C18.04 23.9653 18.0826 23.6617 18.0993 23.219C18.1238 22.5683 18.46 21.9661 19.0281 21.6405C19.5963 21.3149 20.29 21.3271 20.87 21.6313C21.2647 21.8383 21.5508 21.9534 21.833 21.9903C22.4512 22.0711 23.0765 21.9048 23.5712 21.5281C23.9422 21.2456 24.216 20.7748 24.7638 19.8332C25.3115 18.8917 25.5854 18.4209 25.6464 17.9608C25.7278 17.3472 25.5603 16.7267 25.1807 16.2358C25.0074 16.0117 24.7639 15.8233 24.3859 15.5876C23.8304 15.2412 23.473 14.651 23.473 13.9999C23.473 13.3488 23.8305 12.7588 24.3859 12.4124C24.764 12.1767 25.0075 11.9883 25.1808 11.7641C25.5604 11.2732 25.7279 10.6527 25.6465 10.0391C25.5855 9.57897 25.3116 9.1082 24.7639 8.16666C24.2162 7.22512 23.9423 6.75435 23.5713 6.47181C23.0766 6.09508 22.4513 5.92882 21.8331 6.00959C21.5509 6.04647 21.2648 6.16158 20.8701 6.36859C20.2901 6.67285 19.5964 6.68502 19.0282 6.35945C18.46 6.03388 18.1238 5.4316 18.0993 4.78092C18.0826 4.33822 18.0399 4.03471 17.931 3.77373C17.6924 3.202 17.2347 2.74776 16.6586 2.51094ZM14.5833 17.5C16.531 17.5 18.11 15.933 18.11 14C18.11 12.067 16.531 10.5 14.5833 10.5C12.6356 10.5 11.0567 12.067 11.0567 14C11.0567 15.933 12.6356 17.5 14.5833 17.5Z" fill="white" />
  </Svg>
));
SettingsIcon.displayName = 'SettingsIcon';

const DeleteTrashIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6.38597C3 5.90152 3.34538 5.50879 3.77143 5.50879L6.43567 5.50832C6.96502 5.49306 7.43202 5.11033 7.61214 4.54412C7.61688 4.52923 7.62232 4.51087 7.64185 4.44424L7.75665 4.05256C7.8269 3.81241 7.8881 3.60318 7.97375 3.41617C8.31209 2.67736 8.93808 2.16432 9.66147 2.03297C9.84457 1.99972 10.0385 1.99986 10.2611 2.00002H13.7391C13.9617 1.99986 14.1556 1.99972 14.3387 2.03297C15.0621 2.16432 15.6881 2.67736 16.0264 3.41617C16.1121 3.60318 16.1733 3.81241 16.2435 4.05256L16.3583 4.44424C16.3778 4.51087 16.3833 4.52923 16.388 4.54412C16.5682 5.11033 17.1278 5.49353 17.6571 5.50879H20.2286C20.6546 5.50879 21 5.90152 21 6.38597C21 6.87043 20.6546 7.26316 20.2286 7.26316H3.77143C3.34538 7.26316 3 6.87043 3 6.38597Z" fill="white" />
    <Path fillRule="evenodd" clipRule="evenodd" d="M11.5956 22.0001H12.4044C15.1871 22.0001 16.5785 22.0001 17.4831 21.1142C18.3878 20.2283 18.4803 18.7751 18.6654 15.8686L18.9321 11.6807C19.0326 10.1037 19.0828 9.31524 18.6289 8.81558C18.1751 8.31592 17.4087 8.31592 15.876 8.31592H8.12404C6.59127 8.31592 5.82488 8.31592 5.37105 8.81558C4.91722 9.31524 4.96744 10.1037 5.06788 11.6807L5.33459 15.8686C5.5197 18.7751 5.61225 20.2283 6.51689 21.1142C7.42153 22.0001 8.81289 22.0001 11.5956 22.0001ZM10.2463 12.1886C10.2051 11.7548 9.83753 11.4382 9.42537 11.4816C9.01321 11.525 8.71251 11.9119 8.75372 12.3457L9.25372 17.6089C9.29494 18.0427 9.66247 18.3593 10.0746 18.3159C10.4868 18.2725 10.7875 17.8856 10.7463 17.4518L10.2463 12.1886ZM14.5746 11.4816C14.9868 11.525 15.2875 11.9119 15.2463 12.3457L14.7463 17.6089C14.7051 18.0427 14.3375 18.3593 13.9254 18.3159C13.5132 18.2725 13.2125 17.8856 13.2537 17.4518L13.7537 12.1886C13.7949 11.7548 14.1625 11.4382 14.5746 11.4816Z" fill="white" />
  </Svg>
));
DeleteTrashIcon.displayName = 'DeleteTrashIcon';

const LogoutDoorIcon = React.memo(() => (
  <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
    <Path fillRule="evenodd" clipRule="evenodd" d="M11.3251 2.81014C10.5 3.54163 10.5 4.87969 10.5 7.5558V20.4442C10.5 23.1203 10.5 24.4584 11.3251 25.1899C12.1503 25.9213 13.4115 25.7014 15.9339 25.2614L18.6508 24.7875C21.4444 24.3003 22.8411 24.0567 23.6706 23.032C24.5 22.0074 24.5 20.5255 24.5 17.5617V10.4383C24.5 7.4745 24.5 5.9926 23.6706 4.96796C22.8411 3.94332 21.4444 3.6997 18.6508 3.21245L15.9339 2.73858C13.4115 2.29863 12.1503 2.07865 11.3251 2.81014ZM14 11.8634C14.4832 11.8634 14.875 12.2734 14.875 12.7791V15.2209C14.875 15.7266 14.4832 16.1366 14 16.1366C13.5168 16.1366 13.125 15.7266 13.125 15.2209V12.7791C13.125 12.2734 13.5168 11.8634 14 11.8634Z" fill="white" />
    <Path d="M8.80503 5.25C6.40371 5.2535 5.15199 5.30631 4.35427 6.10402C3.5 6.9583 3.5 8.33323 3.5 11.0831V16.9164C3.5 19.6663 3.5 21.0412 4.35427 21.8955C5.15199 22.6932 6.40371 22.746 8.80503 22.7495C8.74982 22.0223 8.74991 21.1816 8.75001 20.273V7.72648C8.74991 6.81786 8.74982 5.97719 8.80503 5.25Z" fill="white" />
  </Svg>
));
LogoutDoorIcon.displayName = 'LogoutDoorIcon';

const VerifyPhoneIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M15.5562 14.4062L15.1007 14.859C15.1007 14.859 14.0181 15.9355 11.0631 12.9972C8.10812 10.059 9.1907 8.98257 9.1907 8.98257L9.47752 8.69738C10.1841 7.99484 10.2507 6.86691 9.63424 6.04348L8.37326 4.35908C7.61028 3.33992 6.13596 3.20529 5.26145 4.07483L3.69185 5.63552C3.25823 6.06668 2.96765 6.62559 3.00289 7.24561C3.09304 8.83182 3.81071 12.2447 7.81536 16.2266C12.0621 20.4492 16.0468 20.617 17.6763 20.4651C18.1917 20.4171 18.6399 20.1546 19.0011 19.7954L20.4217 18.383C21.3806 17.4295 21.1102 15.7949 19.8833 15.128L17.9728 14.0894C17.1672 13.6515 16.1858 13.7801 15.5562 14.4062Z" fill="white" />
  </Svg>
));
VerifyPhoneIcon.displayName = 'VerifyPhoneIcon';

const VerifyEmailIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path fillRule="evenodd" clipRule="evenodd" d="M3.17157 5.17157C2 6.34315 2 8.22876 2 12C2 15.7712 2 17.6569 3.17157 18.8284C4.34315 20 6.22876 20 10 20H14C17.7712 20 19.6569 20 20.8284 18.8284C22 17.6569 22 15.7712 22 12C22 8.22876 22 6.34315 20.8284 5.17157C19.6569 4 17.7712 4 14 4H10C6.22876 4 4.34315 4 3.17157 5.17157ZM18.5762 7.51986C18.8413 7.83807 18.7983 8.31099 18.4801 8.57617L16.2837 10.4066C15.3973 11.1452 14.6789 11.7439 14.0448 12.1517C13.3843 12.5765 12.7411 12.8449 12 12.8449C11.2589 12.8449 10.6157 12.5765 9.95518 12.1517C9.32112 11.7439 8.60271 11.1452 7.71636 10.4066L5.51986 8.57617C5.20165 8.31099 5.15866 7.83807 5.42383 7.51986C5.68901 7.20165 6.16193 7.15866 6.48014 7.42383L8.63903 9.22291C9.57199 10.0004 10.2197 10.5384 10.7666 10.8901C11.2959 11.2306 11.6549 11.3449 12 11.3449C12.3451 11.3449 12.7041 11.2306 13.2334 10.8901C13.7803 10.5384 14.428 10.0004 15.361 9.22291L17.5199 7.42383C17.8381 7.15866 18.311 7.20165 18.5762 7.51986Z" fill="white" />
  </Svg>
));
VerifyEmailIcon.displayName = 'VerifyEmailIcon';

const ExitIcon = React.memo(() => (
  <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
    <Path fillRule="evenodd" clipRule="evenodd" d="M11.3251 2.81014C10.5 3.54163 10.5 4.87969 10.5 7.5558V20.4442C10.5 23.1203 10.5 24.4584 11.3251 25.1899C12.1503 25.9213 13.4115 25.7014 15.9339 25.2614L18.6508 24.7875C21.4444 24.3003 22.8411 24.0567 23.6706 23.032C24.5 22.0074 24.5 20.5255 24.5 17.5617V10.4383C24.5 7.4745 24.5 5.9926 23.6706 4.96796C22.8411 3.94332 21.4444 3.6997 18.6508 3.21245L15.9339 2.73858C13.4115 2.29863 12.1503 2.07865 11.3251 2.81014ZM14 11.8634C14.4832 11.8634 14.875 12.2734 14.875 12.7791V15.2209C14.875 15.7266 14.4832 16.1366 14 16.1366C13.5168 16.1366 13.125 15.7266 13.125 15.2209V12.7791C13.125 12.2734 13.5168 11.8634 14 11.8634Z" fill="#FF5151" />
    <Path d="M8.80503 5.25C6.40371 5.2535 5.15199 5.30631 4.35427 6.10402C3.5 6.9583 3.5 8.33323 3.5 11.0831V16.9164C3.5 19.6663 3.5 21.0412 4.35427 21.8955C5.15199 22.6932 6.40371 22.746 8.80503 22.7495C8.74982 22.0223 8.74991 21.1816 8.75001 20.273V7.72648C8.74991 6.81786 8.74982 5.97719 8.80503 5.25Z" fill="#FF5151" />
  </Svg>
));
ExitIcon.displayName = 'ExitIcon';

const AltArrowRight = React.memo(() => (
  <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
    <Path d="M10.5 5.83334L17.5 14L10.5 22.1667" stroke="#F6F6F6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));
AltArrowRight.displayName = 'AltArrowRight';

const NotificationIcon = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d="M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z" fill="white" fillOpacity={0.1} />
    <Path d="M14.9598 24.8682C15.6607 25.7592 16.7618 26.3333 18 26.3333C19.2382 26.3333 20.3393 25.7592 21.0402 24.8682C19.022 25.1416 16.978 25.1416 14.9598 24.8682Z" fill="white" />
    <Path d="M23.6243 15.5V16.0867C23.6243 16.7909 23.8252 17.4793 24.2018 18.0652L25.1247 19.501C25.9676 20.8124 25.3241 22.5949 23.858 23.0096C20.0227 24.0945 15.9773 24.0945 12.142 23.0096C10.6759 22.5949 10.0324 20.8124 10.8753 19.5009L11.7982 18.0652C12.1748 17.4793 12.3757 16.7909 12.3757 16.0867V15.5C12.3757 12.2783 14.8938 9.66666 18 9.66666C21.1062 9.66666 23.6243 12.2783 23.6243 15.5Z" fill="white" />
  </Svg>
));
NotificationIcon.displayName = 'NotificationIcon';

const SubscriptionIcon = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d="M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z" fill="white" fillOpacity={0.1} />
    <Path d="M19.6665 11.3333H16.3332C13.1905 11.3333 11.6191 11.3333 10.6428 12.3097C9.93986 13.0126 9.74304 14.024 9.68793 15.7083H26.3117C26.2566 14.024 26.0598 13.0126 25.3569 12.3097C24.3805 11.3333 22.8092 11.3333 19.6665 11.3333Z" fill="white" />
    <Path d="M16.3332 24.6667H19.6665C22.8092 24.6667 24.3805 24.6667 25.3569 23.6904C26.3332 22.7141 26.3332 21.1427 26.3332 18C26.3332 17.6317 26.3332 17.285 26.3316 16.9583H9.66807C9.6665 17.285 9.6665 17.6317 9.6665 18C9.6665 21.1427 9.6665 22.7141 10.6428 23.6904C11.6191 24.6667 13.1905 24.6667 16.3332 24.6667Z" fill="white" />
    <Path fillRule="evenodd" clipRule="evenodd" d="M12.3748 21.3333C12.3748 20.9882 12.6547 20.7083 12.9998 20.7083H16.3332C16.6783 20.7083 16.9582 20.9882 16.9582 21.3333C16.9582 21.6785 16.6783 21.9583 16.3332 21.9583H12.9998C12.6547 21.9583 12.3748 21.6785 12.3748 21.3333Z" fill="#100E19" />
    <Path fillRule="evenodd" clipRule="evenodd" d="M17.7915 21.3333C17.7915 20.9882 18.0713 20.7083 18.4165 20.7083H19.6665C20.0117 20.7083 20.2915 20.9882 20.2915 21.3333C20.2915 21.6785 20.0117 21.9583 19.6665 21.9583H18.4165C18.0713 21.9583 17.7915 21.6785 17.7915 21.3333Z" fill="#100E19" />
  </Svg>
));
SubscriptionIcon.displayName = 'SubscriptionIcon';

const BiometricIcon = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d="M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z" fill="white" fillOpacity={0.1} />
    <Path fillRule="evenodd" clipRule="evenodd" d="M10.5 16.6805C10.5 14.0159 10.5 12.6836 10.8146 12.2353C11.1292 11.7871 12.3819 11.3583 14.8874 10.5007L15.3648 10.3373C16.6708 9.89019 17.3238 9.66666 18 9.66666C18.6762 9.66666 19.3292 9.89019 20.6352 10.3373L21.1126 10.5007C23.6181 11.3583 24.8708 11.7871 25.1854 12.2353C25.5 12.6836 25.5 14.0159 25.5 16.6805V17.9928C25.5 22.6912 21.9675 24.9712 19.7512 25.9394C19.15 26.202 18.8494 26.3333 18 26.3333C17.1506 26.3333 16.85 26.202 16.2488 25.9394C14.0325 24.9712 10.5 22.6912 10.5 17.9928V16.6805ZM19.6667 15.5C19.6667 16.4205 18.9205 17.1667 18 17.1667C17.0795 17.1667 16.3333 16.4205 16.3333 15.5C16.3333 14.5795 17.0795 13.8333 18 13.8333C18.9205 13.8333 19.6667 14.5795 19.6667 15.5ZM18 22.1667C21.3333 22.1667 21.3333 21.4205 21.3333 20.5C21.3333 19.5795 19.8409 18.8333 18 18.8333C16.1591 18.8333 14.6667 19.5795 14.6667 20.5C14.6667 21.4205 14.6667 22.1667 18 22.1667Z" fill="white" />
  </Svg>
));
BiometricIcon.displayName = 'BiometricIcon';

const ThemeIcon = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d="M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z" fill="white" fillOpacity={0.1} />
    <Path d="M17.9998 26.3334C22.6022 26.3334 26.3332 22.6024 26.3332 18C26.3332 17.6144 25.7553 17.5507 25.5559 17.8807C24.6073 19.4505 22.8845 20.5 20.9165 20.5C17.925 20.5 15.4998 18.0749 15.4998 15.0834C15.4998 13.1154 16.5493 11.3926 18.1191 10.444C18.4491 10.2446 18.3854 9.66669 17.9998 9.66669C13.3975 9.66669 9.6665 13.3976 9.6665 18C9.6665 22.6024 13.3975 26.3334 17.9998 26.3334Z" fill="white" />
  </Svg>
));
ThemeIcon.displayName = 'ThemeIcon';

const AppIconChangeIcon = React.memo(() => (
  <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    <Path d="M0 8C0 3.58172 3.58172 0 8 0H28C32.4183 0 36 3.58172 36 8V28C36 32.4183 32.4183 36 28 36H8C3.58172 36 0 32.4183 0 28V8Z" fill="white" fillOpacity={0.1} />
    <Path fillRule="evenodd" clipRule="evenodd" d="M18.0432 9.66669H17.9572C16.557 9.66668 15.4479 9.66667 14.58 9.7854C13.6867 9.90759 12.9637 10.165 12.3935 10.7452C11.8233 11.3253 11.5703 12.0609 11.4502 12.9698C11.3335 13.8529 11.3335 14.9813 11.3335 16.4059V19.5941C11.3335 21.0188 11.3335 22.1472 11.4502 23.0303C11.5703 23.9391 11.8233 24.6747 12.3935 25.2549C12.9637 25.835 13.6867 26.0925 14.58 26.2146C15.4479 26.3334 16.557 26.3334 17.9571 26.3334H18.0431C19.4433 26.3334 20.5524 26.3334 21.4204 26.2146C22.3136 26.0925 23.0367 25.835 23.6068 25.2549C24.177 24.6747 24.4301 23.9391 24.5502 23.0303C24.6668 22.1472 24.6668 21.0188 24.6668 19.5942V16.4059C24.6668 14.9813 24.6668 13.8529 24.5502 12.9698C24.4301 12.0609 24.177 11.3253 23.6068 10.7452C23.0367 10.165 22.3136 9.90759 21.4204 9.7854C20.5524 9.66667 19.4433 9.66668 18.0432 9.66669ZM15.143 23.4264C15.143 23.1053 15.3989 22.845 15.7144 22.845H20.2859C20.6015 22.845 20.8573 23.1053 20.8573 23.4264C20.8573 23.7475 20.6015 24.0078 20.2859 24.0078H15.7144C15.3989 24.0078 15.143 23.7475 15.143 23.4264Z" fill="white" />
  </Svg>
));
AppIconChangeIcon.displayName = 'AppIconChangeIcon';

const EditPencilIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path fillRule="evenodd" clipRule="evenodd" d="M3.25 22C3.25 21.5858 3.58579 21.25 4 21.25H20C20.4142 21.25 20.75 21.5858 20.75 22C20.75 22.4142 20.4142 22.75 20 22.75H4C3.58579 22.75 3.25 22.4142 3.25 22Z" fill="#4D4D4D" />
    <Path d="M11.5201 14.929L11.5201 14.9289L17.4368 9.01225C16.6315 8.6771 15.6777 8.12656 14.7757 7.22455C13.8736 6.32238 13.323 5.36846 12.9879 4.56312L7.07106 10.4799L7.07101 10.48C6.60932 10.9417 6.37846 11.1725 6.17992 11.4271C5.94571 11.7273 5.74491 12.0522 5.58107 12.396C5.44219 12.6874 5.33894 12.9972 5.13245 13.6167L4.04356 16.8833C3.94194 17.1882 4.02128 17.5243 4.2485 17.7515C4.47573 17.9787 4.81182 18.0581 5.11667 17.9564L8.38334 16.8676C9.00281 16.6611 9.31256 16.5578 9.60398 16.4189C9.94775 16.2551 10.2727 16.0543 10.5729 15.8201C10.8275 15.6215 11.0584 15.3907 11.5201 14.929Z" fill="#4D4D4D" />
    <Path d="M19.0786 7.37044C20.3071 6.14188 20.3071 4.14999 19.0786 2.92142C17.85 1.69286 15.8581 1.69286 14.6296 2.92142L13.9199 3.63105C13.9296 3.6604 13.9397 3.69015 13.9502 3.72028C14.2103 4.47 14.701 5.45281 15.6243 6.37602C16.5475 7.29923 17.5303 7.78999 18.28 8.05009C18.31 8.0605 18.3396 8.07054 18.3688 8.08021L19.0786 7.37044Z" fill="#4D4D4D" />
  </Svg>
));
EditPencilIcon.displayName = 'EditPencilIcon';

// ═══════════════════════════════════════════════
// Language modal SVG icons (JSX)
// ═══════════════════════════════════════════════

const LanguageIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M5 8L11 14M4 14L10 8L12 5M2 5H14M7 2H8M22 22L17 12L12 22M14 18H20" stroke="#F6F6F6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));
LanguageIcon.displayName = 'LanguageIcon';

const CloseCircleIcon = React.memo(() => (
  <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
    <SvgCircle cx={20} cy={20} r={16.6667} fill="white" fillOpacity={0.2} />
    <Path d="M24.1666 15.8333L15.8333 24.1666M15.8333 15.8333L24.1666 24.1666" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
));
CloseCircleIcon.displayName = 'CloseCircleIcon';

const CheckCircleIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={12} cy={12} r={10} fill="white" />
    <Path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="#101010" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));
CheckCircleIcon.displayName = 'CheckCircleIcon';

const CurrencyIcon = React.memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M11.25 7.84748C10.3141 8.10339 9.75 8.82154 9.75 9.5C9.75 10.1785 10.3141 10.8966 11.25 11.1525V7.84748Z" fill="white" />
    <Path d="M12.75 12.8475V16.1525C13.6859 15.8966 14.25 15.1785 14.25 14.5C14.25 13.8215 13.6859 13.1034 12.75 12.8475Z" fill="white" />
    <Path fillRule="evenodd" clipRule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM12 5.25C12.4142 5.25 12.75 5.58579 12.75 6V6.31673C14.3804 6.60867 15.75 7.83361 15.75 9.5C15.75 9.91421 15.4142 10.25 15 10.25C14.5858 10.25 14.25 9.91421 14.25 9.5C14.25 8.82154 13.6859 8.10339 12.75 7.84748V11.3167C14.3804 11.6087 15.75 12.8336 15.75 14.5C15.75 16.1664 14.3804 17.3913 12.75 17.6833V18C12.75 18.4142 12.4142 18.75 12 18.75C11.5858 18.75 11.25 18.4142 11.25 18V17.6833C9.61957 17.3913 8.25 16.1664 8.25 14.5C8.25 14.0858 8.58579 13.75 9 13.75C9.41421 13.75 9.75 14.0858 9.75 14.5C9.75 15.1785 10.3141 15.8966 11.25 16.1525V12.6833C9.61957 12.3913 8.25 11.1664 8.25 9.5C8.25 7.83361 9.61957 6.60867 11.25 6.31673V6C11.25 5.58579 11.5858 5.25 12 5.25Z" fill="white" />
  </Svg>
));
CurrencyIcon.displayName = 'CurrencyIcon';

// ═══════════════════════════════════════════════
// Language & Currency mappings
// ═══════════════════════════════════════════════

const FLAG_EMOJIS: Record<string, string> = {
  ru: '\u{1F1F7}\u{1F1FA}',
  uz: '\u{1F1FA}\u{1F1FF}',
  us: '\u{1F1FA}\u{1F1F8}',
  kz: '\u{1F1F0}\u{1F1FF}',
  de: '\u{1F1E9}\u{1F1EA}',
  az: '\u{1F1E6}\u{1F1FF}',
  by: '\u{1F1E7}\u{1F1FE}',
  ua: '\u{1F1FA}\u{1F1E6}',
  pl: '\u{1F1F5}\u{1F1F1}',
  ge: '\u{1F1EC}\u{1F1EA}',
  cn: '\u{1F1E8}\u{1F1F3}',
};

type CountryOption = {
  code: string;
  country: string;
  flagKey: string;
};

const COUNTRIES: CountryOption[] = [
  { code: 'ru', country: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flagKey: 'ru' },
  { code: 'uz', country: "O'zbek", flagKey: 'uz' },
  { code: 'en', country: 'English', flagKey: 'us' },
  { code: 'kk', country: '\u049A\u0430\u0437\u0430\u049B\u0448\u0430', flagKey: 'kz' },
  { code: 'de', country: 'Deutsch', flagKey: 'de' },
  { code: 'az', country: 'Az\u0259rbaycan', flagKey: 'az' },
  { code: 'be', country: '\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F', flagKey: 'by' },
  { code: 'uk', country: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430', flagKey: 'ua' },
  { code: 'pl', country: 'Polski', flagKey: 'pl' },
  { code: 'ka', country: '\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8', flagKey: 'ge' },
  { code: 'zh', country: '\u4E2D\u6587', flagKey: 'cn' },
];

const LANGUAGE_NAMES: Record<string, string> = {
  uz: "O'zbekcha",
  ru: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439',
  en: 'English',
  be: '\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F',
  uk: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430',
  kk: '\u049A\u0430\u0437\u0430\u049B\u0448\u0430',
  de: 'Deutsch',
  az: 'Az\u0259rbaycan',
  pl: 'Polski',
  ka: '\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8',
  zh: '\u4E2D\u6587',
};

const LANGUAGE_FLAGS: Record<string, string> = {
  uz: '\u{1F1FA}\u{1F1FF}',
  ru: '\u{1F1F7}\u{1F1FA}',
  en: '\u{1F1FA}\u{1F1F8}',
  be: '\u{1F1E7}\u{1F1FE}',
  uk: '\u{1F1FA}\u{1F1E6}',
  kk: '\u{1F1F0}\u{1F1FF}',
  de: '\u{1F1E9}\u{1F1EA}',
  az: '\u{1F1E6}\u{1F1FF}',
  pl: '\u{1F1F5}\u{1F1F1}',
  ka: '\u{1F1EC}\u{1F1EA}',
  zh: '\u{1F1E8}\u{1F1F3}',
};

const CURRENCY_FLAGS: Record<string, string> = {
  UZS: '\u{1F1FA}\u{1F1FF}',
  USD: '\u{1F1FA}\u{1F1F8}',
  EUR: '\u{1F1EA}\u{1F1FA}',
  RUB: '\u{1F1F7}\u{1F1FA}',
  GBP: '\u{1F1EC}\u{1F1E7}',
  TRY: '\u{1F1F9}\u{1F1F7}',
  KZT: '\u{1F1F0}\u{1F1FF}',
  CNY: '\u{1F1E8}\u{1F1F3}',
  JPY: '\u{1F1EF}\u{1F1F5}',
  KRW: '\u{1F1F0}\u{1F1F7}',
  CHF: '\u{1F1E8}\u{1F1ED}',
  AED: '\u{1F1E6}\u{1F1EA}',
  INR: '\u{1F1EE}\u{1F1F3}',
  BRL: '\u{1F1E7}\u{1F1F7}',
  CAD: '\u{1F1E8}\u{1F1E6}',
  AUD: '\u{1F1E6}\u{1F1FA}',
  PLN: '\u{1F1F5}\u{1F1F1}',
  UAH: '\u{1F1FA}\u{1F1E6}',
  GEL: '\u{1F1EC}\u{1F1EA}',
  BYN: '\u{1F1E7}\u{1F1FE}',
  AZN: '\u{1F1E6}\u{1F1FF}',
  AMD: '\u{1F1E6}\u{1F1F2}',
  KGS: '\u{1F1F0}\u{1F1EC}',
  TJS: '\u{1F1F9}\u{1F1EF}',
  MDL: '\u{1F1F2}\u{1F1E9}',
  TMT: '\u{1F1F9}\u{1F1F2}',
};

type CurrencyOption = {
  code: string;
  symbol: string;
};

const CURRENCIES: CurrencyOption[] = [
  { code: 'UZS', symbol: "so'm" },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'RUB', symbol: '₽' },
  { code: 'GBP', symbol: '£' },
  { code: 'TRY', symbol: '₺' },
  { code: 'KZT', symbol: '₸' },
  { code: 'CNY', symbol: '¥' },
  { code: 'JPY', symbol: '¥' },
  { code: 'KRW', symbol: '₩' },
  { code: 'CHF', symbol: 'Fr' },
  { code: 'AED', symbol: 'د.إ' },
  { code: 'INR', symbol: '₹' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'UAH', symbol: '₴' },
  { code: 'GEL', symbol: '₾' },
  { code: 'BYN', symbol: 'Br' },
  { code: 'AZN', symbol: '₼' },
  { code: 'AMD', symbol: '֏' },
  { code: 'KGS', symbol: 'сом' },
  { code: 'TJS', symbol: 'смн' },
  { code: 'MDL', symbol: 'L' },
  { code: 'TMT', symbol: 'm' },
];

// Fallback rates (units of X per 1 USD) — used only when API + DB both unavailable
const FALLBACK_RATES_FROM_USD: Record<string, number> = {
  USD: 1,
  UZS: 12850,
  EUR: 0.925,
  RUB: 93.5,
  GBP: 0.79,
  TRY: 38.5,
  KZT: 510,
  CNY: 7.26,
  JPY: 149.5,
  KRW: 1365,
  CHF: 0.88,
  AED: 3.67,
  INR: 84,
  BRL: 5.75,
  CAD: 1.4,
  AUD: 1.57,
  PLN: 3.84,
  UAH: 41.5,
  GEL: 2.74,
  BYN: 3.27,
  AZN: 1.7,
  AMD: 389,
  KGS: 86.8,
  TJS: 10.9,
  MDL: 17.85,
  TMT: 3.5,
};

// ═══════════════════════════════════════════════
// Phone number masks by country code
// ═══════════════════════════════════════════════

/** Mask definition: country dial prefix → digit group sizes AFTER the prefix */
const PHONE_MASKS: { prefix: string; groups: number[] }[] = [
  // CIS & Central Asia
  { prefix: '+998', groups: [2, 3, 2, 2] },   // Uzbekistan: +998 XX XXX XX XX
  { prefix: '+992', groups: [2, 3, 2, 2] },   // Tajikistan: +992 XX XXX XX XX
  { prefix: '+993', groups: [2, 3, 2, 2] },   // Turkmenistan: +993 XX XXX XX XX
  { prefix: '+996', groups: [3, 3, 3] },       // Kyrgyzstan: +996 XXX XXX XXX
  { prefix: '+374', groups: [2, 3, 3] },       // Armenia: +374 XX XXX XXX
  { prefix: '+994', groups: [2, 3, 2, 2] },   // Azerbaijan: +994 XX XXX XX XX
  { prefix: '+995', groups: [3, 2, 2, 2] },   // Georgia: +995 XXX XX XX XX
  { prefix: '+373', groups: [2, 3, 3] },       // Moldova: +373 XX XXX XXX
  { prefix: '+380', groups: [2, 3, 2, 2] },   // Ukraine: +380 XX XXX XX XX
  { prefix: '+375', groups: [2, 3, 2, 2] },   // Belarus: +375 XX XXX XX XX
  { prefix: '+7',   groups: [3, 3, 2, 2] },   // Russia / Kazakhstan: +7 XXX XXX XX XX
  // Europe
  { prefix: '+48',  groups: [3, 3, 3] },       // Poland: +48 XXX XXX XXX
  { prefix: '+49',  groups: [3, 7] },           // Germany: +49 XXX XXXXXXX
  { prefix: '+44',  groups: [4, 6] },           // UK: +44 XXXX XXXXXX
  { prefix: '+33',  groups: [1, 2, 2, 2, 2] }, // France: +33 X XX XX XX XX
  { prefix: '+34',  groups: [3, 3, 3] },       // Spain: +34 XXX XXX XXX
  { prefix: '+39',  groups: [3, 3, 4] },       // Italy: +39 XXX XXX XXXX
  { prefix: '+90',  groups: [3, 3, 2, 2] },   // Turkey: +90 XXX XXX XX XX
  // Americas
  { prefix: '+1',   groups: [3, 3, 4] },       // USA / Canada: +1 XXX XXX XXXX
  { prefix: '+55',  groups: [2, 5, 4] },       // Brazil: +55 XX XXXXX XXXX
  // Asia
  { prefix: '+86',  groups: [3, 4, 4] },       // China: +86 XXX XXXX XXXX
  { prefix: '+82',  groups: [2, 4, 4] },       // South Korea: +82 XX XXXX XXXX
  { prefix: '+81',  groups: [2, 4, 4] },       // Japan: +81 XX XXXX XXXX
  { prefix: '+91',  groups: [5, 5] },           // India: +91 XXXXX XXXXX
  // Middle East
  { prefix: '+971', groups: [2, 3, 4] },       // UAE: +971 XX XXX XXXX
];

// Pre-sort by prefix length descending for longest-match-first lookup
const PHONE_MASKS_SORTED = [...PHONE_MASKS].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/**
 * Format a raw phone number string using country-code masks.
 * Truncates any digits that exceed the mask capacity.
 * Input:  "+998901234567"  →  Output: "+998 90 123 45 67"
 * If no mask matches, returns the input unchanged (capped at 16 digits).
 */
const formatPhoneWithMask = (raw: string): string => {
  if (!raw || !raw.startsWith('+')) return raw;
  const digitsOnly = '+' + raw.replace(/[^\d]/g, '');
  if (digitsOnly.length <= 1) return raw;

  const mask = PHONE_MASKS_SORTED.find((m) => digitsOnly.startsWith(m.prefix));
  if (!mask) {
    // No mask — cap at 16 digits total (E.164 max is 15 + the '+')
    return digitsOnly.slice(0, 16);
  }

  const maxBody = mask.groups.reduce((sum, g) => sum + g, 0);
  const after = digitsOnly.slice(mask.prefix.length).slice(0, maxBody);
  let result = mask.prefix;
  let pos = 0;
  for (const size of mask.groups) {
    if (pos >= after.length) break;
    result += ' ' + after.slice(pos, pos + size);
    pos += size;
  }
  return result;
};

/**
 * Strip all formatting (spaces) from a phone number, keeping only digits and +.
 * "+998 90 123 45 67" → "+998901234567"
 */
const stripPhoneFormatting = (formatted: string): string =>
  formatted.replace(/[^\d+]/g, '');

/**
 * Check whether a raw phone number is complete according to its country mask.
 * Returns true only when the exact expected number of digits is present.
 */
const isPhoneComplete = (raw: string): boolean => {
  // Normalize: strip everything except digits, then prepend +
  const digits = raw.replace(/[^\d]/g, '');
  const normalized = '+' + digits;
  const mask = PHONE_MASKS_SORTED.find((m) => normalized.startsWith(m.prefix));
  if (!mask) return normalized.length >= 9; // +XXXXXXXX minimum
  const expected = mask.prefix.length + mask.groups.reduce((sum, g) => sum + g, 0);
  return normalized.length === expected;
};

const formatRateNumber = (num: number): string => {
  if (num >= 1000) {
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  if (num >= 100) return String(Math.round(num));
  if (num >= 1) return String(Math.round(num * 100) / 100);
  if (num >= 0.01) return num.toFixed(2);
  return num.toFixed(4);
};

/**
 * Compute display text like "1 EUR ≈ 13 892 UZS".
 * `rates` is a map of currency → units per 1 USD.
 * rate(X→Y) = rates[Y] / rates[X]
 */
const getExchangeRateText = (
  currencyCode: string,
  primaryCode: string,
  rates: Record<string, number>,
): string => {
  if (currencyCode === primaryCode) return '';
  const currRate = rates[currencyCode];
  const primRate = rates[primaryCode];
  if (!currRate || !primRate) return '';
  const rate = primRate / currRate;
  return `1 ${currencyCode} ≈ ${formatRateNumber(rate)} ${primaryCode}`;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

type ProfileNavigation = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

// ═══════════════════════════════════════════════
// Custom iOS-style Switch (pill-shaped toggle with border)
// ═══════════════════════════════════════════════

const IOS_SWITCH_WIDTH = 64;
const IOS_SWITCH_HEIGHT = 28;
const IOS_THUMB_WIDTH = 39;
const IOS_THUMB_HEIGHT = 24;
const IOS_BORDER = 2;
// Thumb travel = inner content width − thumb width
// Inner content = 64 − 2 * 2 = 60; Travel = 60 − 39 = 21
const IOS_THUMB_TRAVEL = IOS_SWITCH_WIDTH - 2 * IOS_BORDER - IOS_THUMB_WIDTH;

const IOSSwitch = ({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (val: boolean) => void;
}) => {
  const translateX = useRef(new Animated.Value(value ? IOS_THUMB_TRAVEL : 0)).current;
  const colorAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: value ? IOS_THUMB_TRAVEL : 0,
        useNativeDriver: true,
        bounciness: 2,
        speed: 15,
      }),
      Animated.timing(colorAnim, {
        toValue: value ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [value, translateX, colorAnim]);

  const trackBg = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(120,120,128,0.16)', '#34C759'],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View
        style={{
          width: IOS_SWITCH_WIDTH,
          height: IOS_SWITCH_HEIGHT,
          borderRadius: IOS_SWITCH_HEIGHT / 2,
          backgroundColor: trackBg,
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: IOS_BORDER,
            left: IOS_BORDER,
            width: IOS_THUMB_WIDTH,
            height: IOS_THUMB_HEIGHT,
            borderRadius: IOS_THUMB_HEIGHT / 2,
            backgroundColor: '#FFFFFF',
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 4,
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

export const ProfileScreen = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ProfileNavigation>();

  const telegramUser = useAuthStore((s) => s.telegramUser);
  const savedDisplayName = useAuthStore((s) => s.displayName);
  const userId = useAuthStore((s) => s.userId);
  const logout = useAuthStore((s) => s.logout);
  const selectedCurrency = useProfileStore((s) => s.currency);
  const storeSetLanguage = useProfileStore((s) => s.setLanguage);
  const storeSetCurrency = useProfileStore((s) => s.setDefaultCurrency);
  const biometricLock = useProfileStore((s) => s.settings.biometricLock);
  const setBiometricLock = useProfileStore((s) => s.setBiometricLock);
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  const { data: settings } = useSettings();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);
  const logoutPopupOpacity = useRef(new Animated.Value(0)).current;
  const logoutPopupScale = useRef(new Animated.Value(0.9)).current;
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletePopupOpacity = useRef(new Animated.Value(0)).current;
  const deletePopupScale = useRef(new Animated.Value(0.9)).current;
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [activePicker, setActivePicker] = useState<'language' | 'currency' | 'settings' | null>(null);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [ratesMap, setRatesMap] = useState<Record<string, number>>(FALLBACK_RATES_FROM_USD);
  const [loadingRates, setLoadingRates] = useState(false);

  // Settings form state
  const [settingsName, setSettingsName] = useState('');
  const [settingsTelegram, setSettingsTelegram] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Settings field editing mode
  const [editingField, setEditingField] = useState<'name' | 'telegram' | 'phone' | 'email' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState(false);
  const fieldErrorOpacity = useRef(new Animated.Value(0)).current;
  const fieldShakeAnim = useRef(new Animated.Value(0)).current;
  const fieldBorderAnim = useRef(new Animated.Value(0)).current; // 0=transparent/editing, 1=error red

  const showFieldError = useCallback(() => {
    setEditingError(true);
    Animated.parallel([
      Animated.timing(fieldErrorOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(fieldBorderAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
    ]).start();
    Animated.sequence([
      Animated.timing(fieldShakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(fieldShakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(fieldShakeAnim, { toValue: 5, duration: 55, useNativeDriver: true }),
      Animated.timing(fieldShakeAnim, { toValue: -3, duration: 50, useNativeDriver: true }),
      Animated.timing(fieldShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [fieldErrorOpacity, fieldBorderAnim, fieldShakeAnim]);

  const clearFieldError = useCallback(() => {
    if (!editingError) return;
    Animated.parallel([
      Animated.timing(fieldErrorOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(fieldBorderAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => setEditingError(false));
  }, [editingError, fieldErrorOpacity, fieldBorderAnim]);

  // Memoize sorted currencies (selected currency first) — avoids re-sorting on every render
  const sortedCurrencies = useMemo(
    () => [...CURRENCIES].sort((a, b) => {
      if (a.code === selectedCurrency) return -1;
      if (b.code === selectedCurrency) return 1;
      return 0;
    }),
    [selectedCurrency],
  );

  // OTP verification state (phone/email linking from settings)
  const [verifyingField, setVerifyingField] = useState<'phone' | 'email' | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifySending, setVerifySending] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const hiddenOtpRef = useRef<TextInput>(null);

  // Per-cell dot animations (scale + opacity) — same as PhoneVerifyScreen
  const otpDotAnims = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0)),
  ).current;
  const otpBorderAnims = useRef(
    Array.from({ length: 4 }, (_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;
  const otpErrorOpacity = useRef(new Animated.Value(0)).current;
  const otpShakeAnim = useRef(new Animated.Value(0)).current;

  const otpShowDot = useCallback((index: number) => {
    if (index > 0) Animated.timing(otpBorderAnims[index - 1], { toValue: 0, duration: 150, useNativeDriver: false }).start();
    Animated.timing(otpBorderAnims[index], { toValue: 0, duration: 150, useNativeDriver: false }).start();
    if (index + 1 < 4) Animated.timing(otpBorderAnims[index + 1], { toValue: 1, duration: 200, useNativeDriver: false }).start();
    otpDotAnims[index].setValue(0);
    Animated.spring(otpDotAnims[index], { toValue: 1, damping: 14, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();
  }, [otpDotAnims, otpBorderAnims]);

  const otpHideDot = useCallback((index: number) => {
    if (index + 1 < 4) Animated.timing(otpBorderAnims[index + 1], { toValue: 0, duration: 150, useNativeDriver: false }).start();
    Animated.timing(otpBorderAnims[index], { toValue: 1, duration: 200, useNativeDriver: false }).start();
    Animated.timing(otpDotAnims[index], { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }, [otpDotAnims, otpBorderAnims]);

  const otpResetDots = useCallback(() => {
    const dotFades = otpDotAnims.map((a) => Animated.timing(a, { toValue: 0, duration: 200, useNativeDriver: true }));
    const borderFades = otpBorderAnims.map((a, i) => Animated.timing(a, { toValue: i === 0 ? 1 : 0, duration: 200, useNativeDriver: false }));
    const errorFade = Animated.timing(otpErrorOpacity, { toValue: 0, duration: 250, useNativeDriver: true });
    Animated.parallel([...dotFades, ...borderFades, errorFade]).start();
  }, [otpDotAnims, otpBorderAnims, otpErrorOpacity]);

  const otpShowError = useCallback(() => {
    Animated.timing(otpErrorOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.timing(otpShakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(otpShakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(otpShakeAnim, { toValue: 7, duration: 60, useNativeDriver: true }),
      Animated.timing(otpShakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(otpShakeAnim, { toValue: 3, duration: 50, useNativeDriver: true }),
      Animated.timing(otpShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [otpErrorOpacity, otpShakeAnim]);

  // Resend OTP cooldown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  // Incognito WebView for Telegram auth (no cookies → fresh login → can switch account)
  const [showTelegramWebView, setShowTelegramWebView] = useState(false);

  // Flag: auto-reopen settings modal after returning from Telegram auth
  const pendingTelegramReturn = useRef(false);

  // Ref to always hold the latest openPicker (avoids stale closure in deep link handler)
  const openPickerRef = useRef<(type: 'language' | 'currency' | 'settings') => void>(() => {});

  // Reanimated: animate edit buttons above keyboard
  const editBtnTranslateY = useSharedValue(0);
  const editBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: editBtnTranslateY.value }],
  }));

  // Track keyboard and move edit buttons above it
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const kbHeight = e.endCoordinates.height;
        editBtnTranslateY.value = withSpring(-(kbHeight - 16), { damping: 20, stiffness: 150, mass: 0.8 });
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        editBtnTranslateY.value = withSpring(0, { damping: 20, stiffness: 150, mass: 0.8 });
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, editBtnTranslateY]);

  // Picker animation values
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const topFadeOpacity = useRef(new Animated.Value(0)).current;
  const pickerScrollRef = useRef<ScrollView>(null);

  // Display name: saved name → Telegram name → "Guest"
  const displayName =
    savedDisplayName ||
    (telegramUser
      ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ')
      : t('profile.guest') || 'Guest');

  // Auth method: Telegram @username, email, or phone
  const authMethod = telegramUser?.username
    ? `@${telegramUser.username}`
    : userId || '';

  const isPremium = settings?.tier === 'premium';
  const planLabel = isPremium ? 'Premium' : 'Free';

  // Current language
  const currentLang = i18n.language;
  const languageDisplayName = LANGUAGE_NAMES[currentLang] || LANGUAGE_NAMES.en;
  const languageFlag = LANGUAGE_FLAGS[currentLang] || LANGUAGE_FLAGS.en;

  // Current currency
  const currencyFlag = CURRENCY_FLAGS[selectedCurrency] || CURRENCY_FLAGS.UZS;

  // Load live exchange rates on mount (from cache or API)
  useEffect(() => {
    let cancelled = false;
    setLoadingRates(true);
    getRatesFromUSD()
      .then((rates) => {
        if (!cancelled) setRatesMap(rates);
      })
      .catch(() => {
        // Keep fallback rates
      })
      .finally(() => {
        if (!cancelled) setLoadingRates(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Animation starts AFTER Modal is fully mounted (onShow) to prevent "jump" effect
  const startLogoutAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(logoutPopupOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(logoutPopupScale, {
        toValue: 1,
        damping: 24,
        stiffness: 180,
        mass: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoutPopupOpacity, logoutPopupScale]);

  const openLogoutPopup = useCallback(() => {
    logoutPopupOpacity.setValue(0);
    logoutPopupScale.setValue(0.94);
    setTabBarHidden(true);
    setShowLogoutPopup(true);
    // Animation deferred to onShow callback
  }, [logoutPopupOpacity, logoutPopupScale, setTabBarHidden]);

  const closeLogoutPopup = useCallback(() => {
    Animated.parallel([
      Animated.timing(logoutPopupOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(logoutPopupScale, {
        toValue: 0.95,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLogoutPopup(false);
      setTabBarHidden(false);
    });
  }, [logoutPopupOpacity, logoutPopupScale, setTabBarHidden]);

  const confirmLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      setTabBarHidden(false);
      await logout();
    } catch {
      setIsLoggingOut(false);
      setShowLogoutPopup(false);
      setTabBarHidden(false);
    }
  }, [logout, setTabBarHidden]);

  // Biometric lock toggle handler
  const handleBiometricToggle = useCallback(async (newValue: boolean) => {
    if (!newValue) {
      // Turning off — no verification needed
      setBiometricLock(false);
      return;
    }
    // Turning on — verify hardware + enrollment + authenticate to confirm
    try {
      const hasHardware = await Biometric.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(t('profile.biometricLock'), t('profile.biometricNotAvailable'));
        return;
      }
      const isEnrolled = await Biometric.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(t('profile.biometricLock'), t('profile.biometricNotEnrolled'));
        return;
      }
      // Confirm identity with biometric before enabling
      const result = await Biometric.authenticateAsync({
        promptMessage: t('auth.biometricPrompt'),
        cancelLabel: t('common.cancel'),
        disableDeviceFallback: true,
      });
      if (result.success) {
        setBiometricLock(true);
      }
      // If cancelled/failed — don't enable
    } catch {
      // Biometric error — don't enable
    }
  }, [t, setBiometricLock]);

  // Language picker scroll handler
  const handlePickerScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const isScrolled = y > 4;
    if (isScrolled !== scrolledDown) {
      setScrolledDown(isScrolled);
      Animated.timing(topFadeOpacity, {
        toValue: isScrolled ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [scrolledDown, topFadeOpacity]);

  const openPicker = useCallback((type: 'language' | 'currency' | 'settings') => {
    setScrolledDown(false);
    topFadeOpacity.setValue(0);
    // Ensure sheet is fully offscreen + overlay invisible before content switch
    sheetTranslateY.setValue(SCREEN_HEIGHT);
    overlayOpacity.setValue(0);
    pickerScrollRef.current?.scrollTo({ y: 0, animated: false });
    // Pre-populate settings form when opening settings
    if (type === 'settings') {
      setSettingsName(displayName || '');
      // Resolve values from ALL sources: userId, telegramUser.id (synthetic), linked
      const tgUsername = telegramUser?.username ? `@${telegramUser.username}` : '';
      // userId OR telegramUser.id can hold email/phone (synthetic users)
      const allIds = [userId, telegramUser?.id].filter(Boolean) as string[];
      const phoneFromAuth = allIds.find((id) => id.startsWith('+')) || '';
      const emailFromAuth = allIds.find((id) => id.includes('@')) || '';
      setSettingsTelegram(tgUsername);
      setSettingsPhone(phoneFromAuth);
      setSettingsEmail(emailFromAuth);
      // Then read linked accounts and fill any still-empty fields
      Promise.all([getLinkedTelegram(), getLinkedPhone(), getLinkedEmail()]).then(
        ([linkedTg, linkedPhone, linkedEmail]) => {
          if (!tgUsername && linkedTg?.username) setSettingsTelegram(`@${linkedTg.username}`);
          if (!phoneFromAuth && linkedPhone) setSettingsPhone(linkedPhone);
          if (!emailFromAuth && linkedEmail) setSettingsEmail(linkedEmail);
        },
      );
      setSettingsDirty(false);
      setEditingField(null);
      setEditingValue('');
      setVerifyingField(null);
      setVerifyCode('');
      setVerifyError(false);
    }
    setActivePicker(type);
    setTabBarHidden(true);
    setPickerModalVisible(true);
    // Animation deferred to onShow callback
  }, [navigation, overlayOpacity, sheetTranslateY, topFadeOpacity, displayName, telegramUser, userId, setTabBarHidden]);

  // Animation starts AFTER Modal is fully mounted (onShow) to prevent "jump" effect
  const startPickerAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 28,
        stiffness: 220,
        mass: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY]);

  // Keep ref in sync so deep link handler always uses fresh openPicker
  useEffect(() => { openPickerRef.current = openPicker; }, [openPicker]);

  const closePicker = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPickerModalVisible(false);
      setActivePicker(null);
      setTabBarHidden(false);
    });
  }, [overlayOpacity, sheetTranslateY, setTabBarHidden]);

  const changeLanguage = useCallback((country: CountryOption) => {
    storeSetLanguage(country.code);
    setTimeout(() => closePicker(), 200);
  }, [storeSetLanguage, closePicker]);

  const changeCurrency = useCallback((currency: CurrencyOption) => {
    storeSetCurrency(currency.code);
    setTimeout(() => closePicker(), 200);
  }, [storeSetCurrency, closePicker]);

  const setDisplayNameAndContinue = useAuthStore((s) => s.setDisplayNameAndContinue);

  const handleSaveSettings = useCallback(async () => {
    if (!settingsDirty) return;
    try {
      if (settingsName.trim() && settingsName.trim() !== displayName) {
        await setDisplayNameAndContinue(settingsName.trim());
      }
      setSettingsDirty(false);
      closePicker();
    } catch {
      // ignore
    }
  }, [settingsDirty, settingsName, displayName, setDisplayNameAndContinue, closePicker]);

  // Animation starts AFTER Modal is fully mounted (onShow) to prevent "jump" effect
  const startDeleteAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(deletePopupOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(deletePopupScale, {
        toValue: 1,
        damping: 24,
        stiffness: 180,
        mass: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [deletePopupOpacity, deletePopupScale]);

  const openDeletePopup = useCallback(() => {
    deletePopupOpacity.setValue(0);
    deletePopupScale.setValue(0.94);
    setTabBarHidden(true);
    setShowDeletePopup(true);
    // Animation deferred to onShow callback
  }, [deletePopupOpacity, deletePopupScale, setTabBarHidden]);

  const closeDeletePopup = useCallback(() => {
    Animated.parallel([
      Animated.timing(deletePopupOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(deletePopupScale, {
        toValue: 0.95,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDeletePopup(false);
      setTabBarHidden(false);
    });
  }, [deletePopupOpacity, deletePopupScale, setTabBarHidden]);

  const confirmDeleteAccount = useCallback(async () => {
    setIsDeleting(false);
    setShowDeletePopup(false);
    setTabBarHidden(false);
    Alert.alert(
      'Account deletion is not available yet',
      'We will enable this only after the backend can delete or export user data safely. Use Log out if you only want to leave this device.',
    );
  }, [setTabBarHidden]);

  // Settings field editing mode (animations handled by reanimated entering/exiting)
  const startEditing = useCallback((field: 'name' | 'telegram' | 'phone' | 'email') => {
    const valueMap = { name: settingsName, telegram: settingsTelegram, phone: settingsPhone, email: settingsEmail };
    let value = valueMap[field];
    // Pre-fill empty phone with +998 so user sees country code immediately
    if (field === 'phone' && !value) value = '+998';
    setEditingValue(value);
    setEditingError(false);
    fieldErrorOpacity.setValue(0);
    fieldBorderAnim.setValue(0);
    fieldShakeAnim.setValue(0);
    setEditingField(field);
  }, [settingsName, settingsTelegram, settingsPhone, settingsEmail, fieldErrorOpacity, fieldBorderAnim, fieldShakeAnim]);

  const cancelEditing = useCallback(() => {
    Keyboard.dismiss();
    setEditingError(false);
    fieldErrorOpacity.setValue(0);
    fieldBorderAnim.setValue(0);
    fieldShakeAnim.setValue(0);
    setEditingField(null);
    setEditingValue('');
    setVerifyingField(null);
    setVerifyCode('');
    setVerifyError(false);
    otpResetDots();
  }, [otpResetDots]);

  const saveEditing = useCallback(async () => {
    if (!editingField) return;
    const trimmed = editingValue.trim();
    // Validate name (min 3 chars)
    if (editingField === 'name' && trimmed.length < 3) {
      showFieldError();
      return;
    }
    // Validate email (require 3+ chars TLD: .com, .org, etc.)
    if (editingField === 'email' && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]{3,}$/.test(trimmed)) {
      showFieldError();
      return;
    }
    Keyboard.dismiss();
    if (editingField !== 'name') {
      Alert.alert('Contact editing is not available yet', 'Phone, email, and Telegram changes will be enabled after backend verification/persistence is ready.');
      cancelEditing();
      return;
    }

    setSettingsName(trimmed);
    try {
      if (trimmed && trimmed !== displayName) {
        await setDisplayNameAndContinue(trimmed);
      }
    } catch {
      // ignore
    }
    setEditingField(null);
    setEditingValue('');
  }, [editingField, editingValue, displayName, setDisplayNameAndContinue, t]);

  // Connect Telegram: open widget page in an incognito WebView modal.
  // Incognito = no cookies = Telegram sees a fresh session = user can enter any phone number.
  // This solves the "auto-auth with same account" problem when switching TG accounts.
  const connectTelegram = useCallback(() => {
    Keyboard.dismiss();
    setEditingField(null);
    setEditingValue('');
    setShowTelegramWebView(true);
  }, []);

  // Handle postMessage from WebView — receives castar:// deep link URL
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const url = event.nativeEvent.data;
    if (isAuthCallback(url)) {
      const result = parseAuthCallback(url);
      if (result) {
        setShowTelegramWebView(false);
        persistLinkedTelegram(result.user).then(() => {
          useAuthStore.setState({ telegramUser: result.user });
          setTimeout(() => openPickerRef.current('settings'), 300);
        });
      }
    }
  }, []);

  // Deep link listener: catch castar://auth/callback when returning from TG auth (browser fallback)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      if (!pendingTelegramReturn.current) return;
      const { url } = event;
      if (isAuthCallback(url)) {
        const result = parseAuthCallback(url);
        if (result) {
          pendingTelegramReturn.current = false;
          persistLinkedTelegram(result.user).then(() => {
            useAuthStore.setState({ telegramUser: result.user });
            setTimeout(() => openPickerRef.current('settings'), 500);
          });
        }
      }
    };
    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  // Send OTP for phone/email linking, then switch to verification mode
  const sendLinkOtp = useCallback(async () => {
    if (!editingField || !editingValue.trim()) return;
    // Strip phone formatting before sending ("+998 90 123..." → "+998901234...")
    const value = editingField === 'phone'
      ? stripPhoneFormatting(editingValue)
      : editingValue.trim();
    // Validate phone: must be complete per mask
    if (editingField === 'phone' && !isPhoneComplete(value)) {
      showFieldError();
      return;
    }
    // Validate email: require valid format with 3+ char TLD
    if (editingField === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{3,}$/.test(value)) {
      showFieldError();
      return;
    }
    setVerifySending(true);
    setVerifyError(false);
    try {
      if (editingField === 'phone') {
        await sendPhoneVerificationCode(value);
      } else if (editingField === 'email') {
        await sendVerificationCode(value);
      }
      // Switch to verification mode
      setVerifyingField(editingField as 'phone' | 'email');
      setVerifyCode('');
      setResendTimer(60);
    } catch {
      showFieldError();
    } finally {
      setVerifySending(false);
    }
  }, [editingField, editingValue]);

  // Verify OTP code and link the account
  const verifyLinkOtp = useCallback(async () => {
    if (!verifyingField || !verifyCode.trim()) return;
    // Strip phone formatting before verifying & persisting
    const value = verifyingField === 'phone'
      ? stripPhoneFormatting(editingValue)
      : editingValue.trim();
    const code = verifyCode.trim();
    setVerifySending(true);
    setVerifyError(false);
    try {
      if (verifyingField === 'phone') {
        const res = await verifyPhoneCode(value, code);
        if (!res.ok) {
          setVerifyError(true);
          otpShowError();
          return;
        }
        await persistLinkedPhone(value);
        setSettingsPhone(value);
      } else if (verifyingField === 'email') {
        const res = await verifyEmailCode(value, code);
        if (!res.ok) {
          setVerifyError(true);
          otpShowError();
          return;
        }
        await persistLinkedEmail(value);
        setSettingsEmail(value);
      }
      Keyboard.dismiss();
      otpResetDots();
      setVerifyingField(null);
      setVerifyCode('');
      setEditingField(null);
      setEditingValue('');
    } catch {
      setVerifyError(true);
      otpShowError();
    } finally {
      setVerifySending(false);
    }
  }, [verifyingField, verifyCode, editingValue]);

  // Handle Android back button when picker is open
  useEffect(() => {
    if (!activePicker) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (verifyingField) {
        setVerifyingField(null);
        setVerifyCode('');
        setVerifyError(false);
        otpResetDots();
      } else if (editingField) {
        cancelEditing();
      } else {
        closePicker();
      }
      return true;
    });
    return () => sub.remove();
  }, [activePicker, closePicker, editingField, cancelEditing, verifyingField]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Background glow 1 */}
      <View style={styles.glowContainer} pointerEvents="none">
        <GlowCircle1 />
      </View>

      {/* Background glow 2 */}
      <View style={styles.glow2Container} pointerEvents="none">
        <GlowCircle2 />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >

        {/* ══ Single container for all profile content ══ */}
        <View style={styles.mainContainer}>

          {/* ── Section 1: user name + action buttons ── */}
          <View style={styles.topRow}>
            <View style={styles.userDataLeft}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              {authMethod ? (
                <Text style={styles.userAuthMethod} numberOfLines={1}>
                  {authMethod}
                </Text>
              ) : null}
            </View>

            {/* Settings + Exit buttons (aligned right, opposite name) */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => openPicker('settings')}
                activeOpacity={0.7}
              >
                <SettingsIcon />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exitButton}
                onPress={openLogoutPopup}
                activeOpacity={0.7}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FF2626" />
                ) : (
                  <ExitIcon />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Plan tier chip ── */}
          <TouchableOpacity
            style={[styles.planChip, isPremium && styles.planChipPremium]}
            activeOpacity={0.78}
            onPress={() => navigation.navigate('SubscriptionManagement')}
          >
            <View style={[styles.planChipDot, isPremium && styles.planChipDotPremium]} />
            <Text style={styles.planChipText}>{planLabel}</Text>
          </TouchableOpacity>

          {/* ── Section 2: Currency + Language (32px gap from above) ── */}
          <View style={styles.selectorRow}>
            {/* Currency */}
            <TouchableOpacity
              style={styles.selectorButton}
              activeOpacity={0.7}
              onPress={() => openPicker('currency')}
            >
              <View style={styles.selectorTextGroup}>
                <Text style={styles.selectorLabel}>
                  {t('profile.currency')}
                </Text>
                <Text style={styles.selectorValue} numberOfLines={1}>
                  {currencyFlag} {selectedCurrency}
                </Text>
              </View>
              <AltArrowRight />
            </TouchableOpacity>

            {/* Language */}
            <TouchableOpacity
              style={styles.selectorButton}
              activeOpacity={0.7}
              onPress={() => openPicker('language')}
            >
              <View style={styles.selectorTextGroup}>
                <Text style={styles.selectorLabel}>
                  {t('profile.language')}
                </Text>
                <Text style={styles.selectorValue} numberOfLines={1}>
                  {languageFlag} {languageDisplayName}
                </Text>
              </View>
              <AltArrowRight />
            </TouchableOpacity>
          </View>

          {/* ── Section 3: Customization ── */}
          <Text style={styles.sectionHeader}>
            {t('profile.customization')}
          </Text>

          {/* Application theme button */}
          <TouchableOpacity
            style={styles.sectionButton}
            activeOpacity={0.7}
          >
            <ThemeIcon />
            <View style={styles.sectionButtonTexts}>
              <Text style={styles.sectionButtonTitle}>
                {t('profile.applicationTheme')}
              </Text>
              <Text style={styles.sectionButtonSubtitle}>
                {t('profile.themeDark')}
              </Text>
            </View>
            <AltArrowRight />
          </TouchableOpacity>

          {/* Change app icon button */}
          <TouchableOpacity
            style={[styles.sectionButton, { marginTop: 6 }]}
            activeOpacity={0.7}
          >
            <AppIconChangeIcon />
            <View style={styles.sectionButtonTexts}>
              <Text style={styles.sectionButtonTitle}>
                {t('profile.appIcon')}
              </Text>
              <Text style={styles.sectionButtonSubtitle}>
                {t('profile.iconDefault')}
              </Text>
            </View>
            <AltArrowRight />
          </TouchableOpacity>

          {/* ── Section 4: Other sections (32px gap from above) ── */}
          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
            {t('profile.otherSections')}
          </Text>

          {/* Notifications button */}
          <TouchableOpacity
            style={styles.sectionButton}
            activeOpacity={0.7}
            onPress={() => setNotificationsEnabled((prev) => !prev)}
          >
            <NotificationIcon />
            <View style={styles.sectionButtonTexts}>
              <Text style={styles.sectionButtonTitle}>
                {t('profile.notifications')}
              </Text>
              <Text style={styles.sectionButtonSubtitle}>
                {t('profile.notificationsSubtitle')}
              </Text>
            </View>
            <IOSSwitch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
          </TouchableOpacity>

          {/* Biometric lock button */}
          <TouchableOpacity
            style={[styles.sectionButton, { marginTop: 6 }]}
            activeOpacity={0.7}
            onPress={() => handleBiometricToggle(!biometricLock)}
          >
            <BiometricIcon />
            <View style={styles.sectionButtonTexts}>
              <Text style={styles.sectionButtonTitle} numberOfLines={1} ellipsizeMode="tail">
                {t('profile.biometricLock')}
              </Text>
              <Text style={styles.sectionButtonSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {t('profile.biometricLockSubtitle')}
              </Text>
            </View>
            <IOSSwitch
              value={biometricLock}
              onValueChange={handleBiometricToggle}
            />
          </TouchableOpacity>

          {/* Subscription management button */}
          <TouchableOpacity
            style={[styles.sectionButton, { marginTop: 6 }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('SubscriptionManagement')}
          >
            <SubscriptionIcon />
            <View style={styles.sectionButtonTexts}>
              <Text style={styles.sectionButtonTitle}>
                {t('profile.subscriptionManagement')}
              </Text>
              <Text style={styles.sectionButtonSubtitle}>
                {t('profile.subscriptionNoActive')}
              </Text>
            </View>
            <AltArrowRight />
          </TouchableOpacity>

        </View>

      </ScrollView>

      {/* ══ Picker Overlay ══ */}
      <Modal visible={pickerModalVisible} transparent animationType="none" statusBarTranslucent onShow={startPickerAnimation}>
        <View style={styles.overlayRoot} pointerEvents="auto">
        {/* Animated blur + tint backdrop — pointerEvents="none" at every level so nothing steals touches */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]} pointerEvents="none">
          <BlurView
            intensity={10}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.overlayTint} pointerEvents="none" />
        </Animated.View>

        {/* Tap outside sheet to close */}
        <Pressable
          style={styles.overlayDismiss}
          onPress={closePicker}
        />

        {/* Animated Sheet — slides up from bottom */}
        <Animated.View
          style={[
            styles.modalSheet,
            verifyingField && { height: '85%' },
            { paddingBottom: insets.bottom + 24, transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          {/* Header: icon + title with close button */}
          <View style={[styles.modalHeader, verifyingField && { marginBottom: 8 }]}>
            <View style={styles.modalHeaderLeft}>
              {activePicker === 'currency' ? <CurrencyIcon />
                : activePicker === 'settings'
                  ? (verifyingField === 'phone' ? <VerifyPhoneIcon /> : verifyingField === 'email' ? <VerifyEmailIcon /> : <SettingsIcon size={24} />)
                  : <LanguageIcon />}
              <Text style={styles.modalTitle}>
                {activePicker === 'currency'
                  ? t('profile.selectCurrency')
                  : activePicker === 'settings'
                    ? (verifyingField === 'phone'
                        ? (t('auth.confirmPhoneTitle') || 'Phone confirmation')
                        : verifyingField === 'email'
                          ? (t('auth.confirmEmailTitle') || 'Email confirmation')
                          : (t('profile.settings') || 'Settings'))
                    : t('auth.selectLanguage')}
              </Text>
            </View>
            {!verifyingField && (
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closePicker}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <CloseCircleIcon />
              </TouchableOpacity>
            )}
          </View>

          {/* Content area */}
          {activePicker === 'settings' ? (
            verifyingField ? (
            /* ── OTP Verification UI ── */
            <View style={styles.verifyContent}>
              <Text style={styles.verifySubtitle}>
                {verifyingField === 'phone'
                  ? (t('auth.confirmPhoneSubtitle') || 'We sent an SMS code to your phone number:')
                  : (t('auth.confirmEmailSubtitle') || 'We have sent you an SMS message to your email address:')}{'\n'}
                <Text style={styles.verifyHighlight}>
                  {verifyingField === 'phone' ? formatPhoneWithMask(editingValue) : editingValue}
                </Text>
              </Text>

              {/* Hidden TextInput to capture keyboard input */}
              <TextInput
                ref={hiddenOtpRef}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
                value={verifyCode}
                onChangeText={(v) => {
                  const digits = v.replace(/[^0-9]/g, '').slice(0, 4);
                  const prevLen = verifyCode.length;
                  const newLen = digits.length;
                  if (verifyError) {
                    setVerifyError(false);
                    otpErrorOpacity.setValue(0);
                  }
                  setVerifyCode(digits);
                  // Animate dots
                  if (newLen > prevLen) {
                    for (let idx = prevLen; idx < newLen; idx++) otpShowDot(idx);
                  } else if (newLen < prevLen) {
                    for (let idx = prevLen - 1; idx >= newLen; idx--) otpHideDot(idx);
                  }
                }}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
                caretHidden
              />

              {/* PIN-style cells — same as PhoneVerifyScreen */}
              <Pressable
                style={{ marginTop: 16 }}
                onPress={() => hiddenOtpRef.current?.focus()}
              >
                <Animated.View style={[styles.otpRow, { transform: [{ translateX: otpShakeAnim }] }]}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.otpCellWrap}>
                      <Animated.View
                        style={[
                          styles.otpCell,
                          {
                            borderColor: otpBorderAnims[i].interpolate({
                              inputRange: [0, 1],
                              outputRange: ['transparent', 'rgba(255,255,255,0.2)'],
                            }),
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.otpDot,
                            { opacity: otpDotAnims[i], transform: [{ scale: otpDotAnims[i] }] },
                          ]}
                        />
                      </Animated.View>
                      {/* Error overlay */}
                      <Animated.View
                        style={[styles.otpCell, styles.otpCellError, styles.otpCellOverlay, { opacity: otpErrorOpacity }]}
                        pointerEvents="none"
                      >
                        <View style={[styles.otpDot, styles.otpDotError]} />
                      </Animated.View>
                    </View>
                  ))}
                </Animated.View>
              </Pressable>

              {verifyError && (
                <Text style={styles.verifyErrorText}>{t('auth.invalidCode') || 'Invalid code. Please try again.'}</Text>
              )}

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={async () => {
                  if (resendTimer > 0 || verifySending) return;
                  const value = verifyingField === 'phone'
                    ? stripPhoneFormatting(editingValue)
                    : editingValue.trim();
                  setVerifySending(true);
                  try {
                    if (verifyingField === 'phone') {
                      await sendPhoneVerificationCode(value);
                    } else {
                      await sendVerificationCode(value);
                    }
                    setResendTimer(60);
                    setVerifyCode('');
                    setVerifyError(false);
                    otpResetDots();
                    hiddenOtpRef.current?.focus();
                  } catch { /* ignore */ }
                  finally { setVerifySending(false); }
                }}
                activeOpacity={0.7}
                disabled={resendTimer > 0 || verifySending}
              >
                <Text style={[styles.resendBtnText, resendTimer > 0 && { opacity: 0.4 }]}>
                  {resendTimer > 0
                    ? `${t('auth.resendCode') || 'Resend code'} (${resendTimer}s)`
                    : (t('auth.resendCode') || 'Resend code')}
                </Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <Reanimated.View style={[styles.settingsEditButtons, editBtnAnimStyle]}>
                <TouchableOpacity
                  style={styles.editCancelBtn}
                  onPress={() => {
                    setVerifyingField(null);
                    setVerifyCode('');
                    setVerifyError(false);
                    otpResetDots();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editCancelBtnText}>
                    {t('common.back') || 'Back'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editSaveBtn, (verifyCode.length < 4 || verifySending) && styles.editSaveBtnDisabled]}
                  onPress={verifyLinkOtp}
                  activeOpacity={0.8}
                  disabled={verifyCode.length < 4 || verifySending}
                >
                  <Text style={styles.editSaveBtnText}>
                    {verifySending ? '...' : (t('common.confirm') || 'Confirm')}
                  </Text>
                </TouchableOpacity>
              </Reanimated.View>
            </View>
            ) : (
            /* ── Settings: reanimated FadeIn for fields, translateY for buttons ── */
            <View
              style={{ flex: 1 }}
              onStartShouldSetResponder={() => editingField !== null}
              onResponderRelease={editingField !== null ? cancelEditing : undefined}
            >
              <View style={styles.settingsContent}>
                <View style={styles.settingsFields}>
                  {/* Name */}
                  {(editingField === null || editingField === 'name') && (
                    <Reanimated.View entering={FadeIn.duration(200)}>
                      <Animated.View style={editingField === 'name' ? { transform: [{ translateX: fieldShakeAnim }] } : undefined}>
                        <Animated.View
                          style={[
                            styles.settingsField,
                            editingField === 'name' && styles.settingsFieldEditing,
                            editingField === 'name' && editingError && { borderColor: fieldBorderAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.2)', colors.error[700]] }) },
                          ]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                            activeOpacity={0.7}
                            onPress={editingField === null ? () => startEditing('name') : undefined}
                            disabled={editingField !== null}
                          >
                            <View style={styles.settingsFieldTexts}>
                              <Text style={styles.settingsLabel}>{t('profile.name') || 'Name'}</Text>
                              {editingField === 'name' ? (
                                <TextInput
                                  style={styles.settingsInput}
                                  value={editingValue}
                                  onChangeText={(v) => { setEditingValue(v); if (editingError) clearFieldError(); }}
                                  autoFocus
                                  placeholderTextColor={colors.white[20]}
                                />
                              ) : (
                                <Text style={[styles.settingsValueText, !settingsName && { opacity: 0.5 }]}>{settingsName || '—'}</Text>
                              )}
                            </View>
                            {editingField === null && <EditPencilIcon />}
                          </TouchableOpacity>
                        </Animated.View>
                      </Animated.View>
                      {editingField === 'name' && editingError && (
                        <Animated.Text style={[styles.settingsErrorText, { opacity: fieldErrorOpacity }]}>{t('auth.nameMinLength') || 'Name must be at least 3 characters'}</Animated.Text>
                      )}
                    </Reanimated.View>
                  )}

                  {/* Telegram (read-only — connect via auth flow, no manual input) */}
                  {(editingField === null || editingField === 'telegram') && (
                    <Reanimated.View entering={FadeIn.duration(200)}>
                      <TouchableOpacity
                        style={[styles.settingsField, editingField === 'telegram' && styles.settingsFieldEditing]}
                        activeOpacity={0.7}
                        onPress={editingField === null ? () => startEditing('telegram') : undefined}
                        disabled={editingField !== null}
                      >
                        <View style={styles.settingsFieldTexts}>
                          <Text style={styles.settingsLabel}>{t('profile.telegram') || 'Telegram'}</Text>
                          <Text style={[styles.settingsValueText, !settingsTelegram && { opacity: 0.5 }]}>{settingsTelegram || '@'}</Text>
                        </View>
                        {editingField === null && <EditPencilIcon />}
                      </TouchableOpacity>
                    </Reanimated.View>
                  )}

                  {/* Phone */}
                  {(editingField === null || editingField === 'phone') && (
                    <Reanimated.View entering={FadeIn.duration(200)}>
                      <Animated.View style={editingField === 'phone' ? { transform: [{ translateX: fieldShakeAnim }] } : undefined}>
                        <Animated.View
                          style={[
                            styles.settingsField,
                            editingField === 'phone' && styles.settingsFieldEditing,
                            editingField === 'phone' && editingError && { borderColor: fieldBorderAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.2)', colors.error[700]] }) },
                          ]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                            activeOpacity={0.7}
                            onPress={editingField === null ? () => startEditing('phone') : undefined}
                            disabled={editingField !== null}
                          >
                            <View style={styles.settingsFieldTexts}>
                              <Text style={styles.settingsLabel}>{t('profile.phone') || 'Number'}</Text>
                              {editingField === 'phone' ? (
                                <TextInput
                                  style={styles.settingsInput}
                                  value={formatPhoneWithMask(editingValue)}
                                  onChangeText={(v) => {
                                    let raw = stripPhoneFormatting(v);
                                    if (!raw.startsWith('+')) raw = '+' + raw;
                                    const m = PHONE_MASKS_SORTED.find((pm) => raw.startsWith(pm.prefix));
                                    if (m) {
                                      const maxLen = m.prefix.length + m.groups.reduce((s, g) => s + g, 0);
                                      raw = raw.slice(0, maxLen);
                                    } else {
                                      raw = raw.slice(0, 16);
                                    }
                                    setEditingValue(raw);
                                    if (editingError) clearFieldError();
                                  }}
                                  autoFocus
                                  keyboardType="phone-pad"
                                  placeholderTextColor={colors.white[20]}
                                />
                              ) : (
                                <Text style={[styles.settingsValueText, !settingsPhone && { opacity: 0.5 }]}>{(settingsPhone && formatPhoneWithMask(settingsPhone)) || '+998'}</Text>
                              )}
                            </View>
                            {editingField === null && <EditPencilIcon />}
                          </TouchableOpacity>
                        </Animated.View>
                      </Animated.View>
                      {editingField === 'phone' && editingError && (
                        <Animated.Text style={[styles.settingsErrorText, { opacity: fieldErrorOpacity }]}>{t('profile.phoneError') || 'Enter a complete phone number'}</Animated.Text>
                      )}
                    </Reanimated.View>
                  )}

                  {/* Email */}
                  {(editingField === null || editingField === 'email') && (
                    <Reanimated.View entering={FadeIn.duration(200)}>
                      <Animated.View style={editingField === 'email' ? { transform: [{ translateX: fieldShakeAnim }] } : undefined}>
                        <Animated.View
                          style={[
                            styles.settingsField,
                            editingField === 'email' && styles.settingsFieldEditing,
                            editingField === 'email' && editingError && { borderColor: fieldBorderAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.2)', colors.error[700]] }) },
                          ]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                            activeOpacity={0.7}
                            onPress={editingField === null ? () => startEditing('email') : undefined}
                            disabled={editingField !== null}
                          >
                            <View style={styles.settingsFieldTexts}>
                              <Text style={styles.settingsLabel}>{t('profile.email') || 'E-mail'}</Text>
                              {editingField === 'email' ? (
                                <TextInput
                                  style={styles.settingsInput}
                                  value={editingValue}
                                  onChangeText={(v) => { setEditingValue(v); if (editingError) clearFieldError(); }}
                                  autoFocus
                                  keyboardType="email-address"
                                  placeholderTextColor={colors.white[20]}
                                />
                              ) : (
                                <Text style={[styles.settingsValueText, !settingsEmail && { opacity: 0.5 }]}>{settingsEmail || 'castar@gmail.com'}</Text>
                              )}
                            </View>
                            {editingField === null && <EditPencilIcon />}
                          </TouchableOpacity>
                        </Animated.View>
                      </Animated.View>
                      {editingField === 'email' && editingError && (
                        <Animated.Text style={[styles.settingsErrorText, { opacity: fieldErrorOpacity }]}>{t('auth.emailError') || 'Please enter a valid email address'}</Animated.Text>
                      )}
                    </Reanimated.View>
                  )}
                </View>

                {/* Buttons: edit mode → Cancel + action btn (Save / Connect X), normal → Delete */}
                {editingField !== null ? (
                  <Reanimated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.settingsEditButtons, editBtnAnimStyle]}
                  >
                    <TouchableOpacity
                      style={styles.editCancelBtn}
                      onPress={cancelEditing}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.editCancelBtnText}>
                        {t('common.back') || 'Back'}
                      </Text>
                    </TouchableOpacity>

                    {/* Telegram: not connected → Connect TG; connected → switch account */}
                    {editingField === 'telegram' ? (
                      <TouchableOpacity
                        style={styles.editSaveBtn}
                        onPress={connectTelegram}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.editSaveBtnText}>
                          {settingsTelegram
                            ? (t('profile.switchTelegram') || 'Switch account')
                            : (t('profile.connectTelegram') || 'Connect Telegram')}
                        </Text>
                      </TouchableOpacity>
                    ) : /* Phone/Email: show Confirm if value changed or not connected yet */
                    (editingField === 'phone' || editingField === 'email') ? (
                      (() => {
                        const currentVal = editingField === 'phone' ? settingsPhone : settingsEmail;
                        const rawEditing = editingField === 'phone' ? stripPhoneFormatting(editingValue) : editingValue.trim();
                        const changed = !currentVal || rawEditing !== currentVal;
                        if (!changed) return null;
                        const invalid = editingField === 'phone' ? !isPhoneComplete(editingValue) : !editingValue.trim();
                        return (
                          <TouchableOpacity
                            style={[styles.editSaveBtn, (invalid || verifySending) && styles.editSaveBtnDisabled]}
                            onPress={sendLinkOtp}
                            activeOpacity={0.8}
                            disabled={invalid || verifySending}
                          >
                            <Text style={styles.editSaveBtnText}>
                              {verifySending ? '...' : (t('common.confirm') || 'Confirm')}
                            </Text>
                          </TouchableOpacity>
                        );
                      })()
                    ) : /* Name → Save */
                    (
                      <TouchableOpacity
                        style={styles.editSaveBtn}
                        onPress={saveEditing}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.editSaveBtnText}>
                          {t('common.save') || 'Save'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </Reanimated.View>
                ) : (
                  <View style={styles.settingsButtons}>
                    <TouchableOpacity
                      style={styles.settingsDeleteBtn}
                      onPress={openDeletePopup}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.settingsDeleteText}>
                        {t('profile.deleteAccount') || 'Delete account'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
            )
          ) : (
          /* ── Picker list with fade gradients ── */
          <>
          {activePicker === 'currency' ? (
            <View style={styles.currencyDescriptionRow}>
              <Text style={styles.currencyDescription}>
                {t('profile.currencyDescription')}
              </Text>
              {loadingRates ? (
                <ActivityIndicator size="small" color={colors.white[40]} style={{ marginLeft: 8 }} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.countryListWrapper}>
            <ScrollView
              ref={pickerScrollRef}
              style={styles.countryList}
              contentContainerStyle={styles.countryListContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
              onScroll={handlePickerScroll}
              scrollEventThrottle={16}
            >
              {activePicker === 'currency' ? (
                sortedCurrencies.map((currency) => {
                    const isSelected = currency.code === selectedCurrency;
                    const rateText = getExchangeRateText(currency.code, selectedCurrency, ratesMap);
                    return (
                      <TouchableOpacity
                        key={currency.code}
                        style={styles.countryRow}
                        onPress={() => changeCurrency(currency)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.countryFlagWrap}>
                          <Text style={styles.flagEmojiLarge}>{CURRENCY_FLAGS[currency.code]}</Text>
                        </View>
                        {rateText ? (
                          <View style={styles.currencyTextGroup}>
                            <Text style={styles.currencyCodeText}>{currency.code}</Text>
                            <Text style={styles.currencyRate}>{rateText}</Text>
                          </View>
                        ) : (
                          <Text style={styles.countryName}>{currency.code}</Text>
                        )}
                        {isSelected ? (
                          <CheckCircleIcon />
                        ) : (
                          <View style={styles.radioOuter} />
                        )}
                      </TouchableOpacity>
                    );
                  })
              ) : activePicker === 'language' ? (
                COUNTRIES.map((country, index) => {
                  const isSelected = country.code === currentLang;
                  return (
                    <TouchableOpacity
                      key={`${country.country}-${index}`}
                      style={styles.countryRow}
                      onPress={() => changeLanguage(country)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.countryFlagWrap}>
                        <Text style={styles.flagEmojiLarge}>{FLAG_EMOJIS[country.flagKey]}</Text>
                      </View>
                      <Text style={styles.countryName}>{country.country}</Text>
                      {isSelected ? (
                        <CheckCircleIcon />
                      ) : (
                        <View style={styles.radioOuter} />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : null}
            </ScrollView>

            {/* Top fade gradient — only visible when scrolled */}
            <Animated.View style={[styles.scrollFadeTop, { opacity: topFadeOpacity }]} pointerEvents="none">
              <LinearGradient
                colors={[
                  colors.neutral[900],
                  'rgba(26, 26, 26, 0.8)',
                  'rgba(26, 26, 26, 0)',
                ]}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Bottom fade gradient */}
            <LinearGradient
              colors={[
                'rgba(26, 26, 26, 0)',
                'rgba(26, 26, 26, 0.8)',
                colors.neutral[900],
              ]}
              style={styles.scrollFadeBottom}
              pointerEvents="none"
            />
          </View>
          </>
          )}
        </Animated.View>
        </View>
      </Modal>

      {/* ── Logout Confirmation Popup ── */}
      <Modal visible={showLogoutPopup} transparent animationType="none" statusBarTranslucent onShow={startLogoutAnimation}>
        <View style={styles.logoutOverlay}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: logoutPopupOpacity }]} pointerEvents="none">
            <BlurView
              intensity={10}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16, 16, 16, 0.5)' }]} pointerEvents="none" />
          </Animated.View>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeLogoutPopup} />
          <Animated.View
            style={[
              styles.logoutCard,
              {
                opacity: logoutPopupOpacity,
                transform: [{ scale: logoutPopupScale }],
              },
            ]}
          >
            <LogoutDoorIcon />
            <Text style={styles.logoutCardTitle}>
              {t('profile.logoutTitle') || 'Log out of the application?'}
            </Text>
            <Text style={styles.logoutCardSubtitle}>
              {t('profile.logoutConfirm') || 'Are you sure you want to exit the application?'}
            </Text>
            <View style={styles.logoutCardButtons}>
              <TouchableOpacity
                style={styles.logoutStayBtn}
                onPress={closeLogoutPopup}
                activeOpacity={0.8}
              >
                <Text style={styles.logoutStayText}>
                  {t('profile.stayInApp') || 'Stay in the app'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={confirmLogout}
                activeOpacity={0.8}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FF5151" />
                ) : (
                  <Text style={styles.logoutConfirmText}>
                    {t('profile.logout') || 'Log out of account'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Delete Account Confirmation Popup ── */}
      <Modal visible={showDeletePopup} transparent animationType="none" statusBarTranslucent onShow={startDeleteAnimation}>
        <View style={styles.logoutOverlay}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: deletePopupOpacity }]} pointerEvents="none">
            <BlurView
              intensity={10}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16, 16, 16, 0.5)' }]} pointerEvents="none" />
          </Animated.View>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDeletePopup} />
          <Animated.View
            style={[
              styles.logoutCard,
              {
                opacity: deletePopupOpacity,
                transform: [{ scale: deletePopupScale }],
              },
            ]}
          >
            <DeleteTrashIcon />
            <Text style={styles.logoutCardTitle}>
              {t('profile.deleteAccountTitle') || 'Delete account?'}
            </Text>
            <Text style={styles.logoutCardSubtitle}>
              {t('profile.deleteAccountConfirm') || 'Are you sure you want to delete your account? This action cannot be undone'}
            </Text>
            <View style={styles.logoutCardButtons}>
              <TouchableOpacity
                style={styles.logoutStayBtn}
                onPress={closeDeletePopup}
                activeOpacity={0.8}
              >
                <Text style={styles.logoutStayText}>
                  {t('profile.keepAccount') || 'Keep account'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={confirmDeleteAccount}
                activeOpacity={0.8}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FF2626" />
                ) : (
                  <Text style={styles.logoutConfirmText}>
                    {t('profile.deleteAccount') || 'Delete account'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Telegram Auth WebView Modal (incognito = fresh session, no auto-auth) ── */}
      {showTelegramWebView && (
        <View style={styles.telegramWebViewOverlay}>
          <View style={styles.telegramWebViewHeader}>
            <TouchableOpacity
              onPress={() => setShowTelegramWebView(false)}
              style={styles.telegramWebViewClose}
              activeOpacity={0.7}
            >
              <Text style={styles.telegramWebViewCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.telegramWebViewTitle}>Telegram</Text>
            <View style={{ width: 44 }} />
          </View>
          <WebView
            source={{ uri: getTelegramAuthUrl(i18n.language) }}
            incognito={true}
            style={styles.telegramWebView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={true}
            onMessage={handleWebViewMessage}
            injectedJavaScript={`
              // Intercept castar:// links and send via postMessage to React Native.
              // 1) Catch clicks on <a href="castar://..."> links
              document.addEventListener('click', function(e) {
                var el = e.target;
                while (el && el.tagName !== 'A') el = el.parentElement;
                if (el && el.href && el.href.startsWith('castar://')) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.ReactNativeWebView.postMessage(el.href);
                }
              }, true);
              // 2) Intercept JS-based redirect: override location.href setter
              (function() {
                var origHref = window.location.href;
                var checkInterval = setInterval(function() {
                  // Check all <a> tags for castar:// href (callback page renders them)
                  var links = document.querySelectorAll('a[href^="castar://"]');
                  if (links.length > 0) {
                    clearInterval(checkInterval);
                    window.ReactNativeWebView.postMessage(links[0].href);
                  }
                }, 300);
                // Stop checking after 30s
                setTimeout(function() { clearInterval(checkInterval); }, 30000);
              })();
              true;
            `}
          />
        </View>
      )}
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

  // === Glows (same positions as auth screens) ===
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

  // === Scroll ===
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: grid.margin,
  },

  // === Main container (wraps all content) ===
  mainContainer: {
    marginTop: 32,
  },

  // === Top row: name (left) + buttons (right) ===
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  userDataLeft: {
    flex: 1,
    gap: 6,
    marginRight: 12,
  },
  userName: {
    fontFamily: fontFamily.medium,
    fontSize: 32,
    lineHeight: 40,
    color: colors.white[100],
  },
  userAuthMethod: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[40],
  },

  // === Action buttons (Settings + Exit) ===
  actionButtons: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  actionButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 38, 38, 0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // === Plan tier chip ===
  planChip: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    gap: 7,
    marginBottom: 24,
  },
  planChipPremium: {
    backgroundColor: 'rgba(98, 214, 147, 0.1)',
    borderColor: 'rgba(98, 214, 147, 0.28)',
  },
  planChipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.white[40],
  },
  planChipDotPremium: {
    backgroundColor: colors.success[500],
  },
  planChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white[100],
  },

  // === Currency + Language row ===
  selectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 32,
  },
  selectorButton: {
    flex: 1,
    height: 62,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  selectorTextGroup: {
    flex: 1,
    gap: 4,
    marginRight: 8,
  },
  selectorLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
  },
  selectorValue: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },

  // === Section header ===
  sectionHeader: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
    marginBottom: 8,
  },

  // === Section buttons (notifications, subscription) — separate ===
  sectionButton: {
    height: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionButtonTexts: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    overflow: 'hidden',
  },
  sectionButtonTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },
  sectionButtonSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
  },

  // === Language Picker Overlay (same as OnboardingScreen) ===
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 16, 16, 0.5)',
  },
  overlayDismiss: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.neutral[900],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    gap: 12,
    flex: 1,
  },
  modalCloseBtn: {
    marginLeft: 12,
  },
  modalTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: 32,
    color: colors.white[100],
  },
  countryListWrapper: {
    flex: 1,
    minHeight: 200,
  },
  countryList: {
    flex: 1,
  },
  countryListContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  scrollFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 1,
  },
  scrollFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[850],
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 8,
  },
  countryFlagWrap: {
    width: 24,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  countryName: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },
  flagEmojiLarge: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    lineHeight: 16,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.white[30],
    margin: 2,
  },
  currencyTextGroup: {
    flex: 1,
    gap: 2,
  },
  currencyCodeText: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },
  currencyRate: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white[40],
  },
  currencyDescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  currencyDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white[40],
  },

  // === Settings modal ===
  verifyContent: {
    flex: 1,
    paddingBottom: 8,
  },
  verifyHeader: {
    gap: 12,
    marginBottom: 24,
  },
  verifyHeaderTexts: {
    gap: 8,
  },
  verifyTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: 30,
    color: colors.white[100],
  },
  verifySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[20],
  },
  verifyHighlight: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },
  otpRow: {
    flexDirection: 'row',
    gap: 6,
  },
  otpCellWrap: {
    width: 42,
    height: 51,
  },
  otpCell: {
    width: 42,
    height: 51,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpCellOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  otpCellError: {
    borderColor: '#FF2626',
  },
  otpDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white[100],
  },
  otpDotError: {
    backgroundColor: '#FF2626',
  },
  verifyErrorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error[500],
    marginTop: 8,
    marginLeft: 4,
  },
  resendBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  resendBtnText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[100],
  },
  settingsContent: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  settingsFields: {
    gap: 6,
  },
  settingsButtons: {
    gap: 6,
  },
  settingsEditInner: {
    flex: 1,
    paddingTop: 8,
  },
  settingsEditButtons: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: 6,
  },
  editCancelBtn: {
    height: 51,
    backgroundColor: 'rgba(246, 246, 246, 0.05)',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  editCancelBtnText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
    textAlign: 'center',
  },
  editSaveBtn: {
    height: 51,
    backgroundColor: colors.white[100],
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  editSaveBtnDisabled: {
    opacity: 0.5,
  },
  editSaveBtnText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.neutral[950],
    textAlign: 'center',
  },
  settingsField: {
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
  settingsFieldEditing: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
  settingsErrorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error[500],
    marginTop: 8,
    marginLeft: 4,
  },
  settingsFieldTexts: {
    flex: 1,
    gap: 4,
    marginRight: 8,
  },
  settingsLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white[40],
  },
  settingsInput: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
    padding: 0,
    margin: 0,
    minHeight: 0,
    height: 20,
  },
  settingsValueText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
  },
  settingsSaveBtn: {
    height: 51,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsSaveBtnDisabled: {
    opacity: 0.5,
  },
  settingsSaveText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
  },
  settingsDeleteBtn: {
    height: 51,
    backgroundColor: 'rgba(255, 38, 38, 0.08)',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsDeleteText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: '#FF5151',
  },

  // ── Telegram WebView Modal ──
  telegramWebViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 9999,
  },
  telegramWebViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  telegramWebViewClose: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  telegramWebViewCloseText: {
    fontSize: 20,
    color: colors.white[100],
  },
  telegramWebViewTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    color: colors.white[100],
  },
  telegramWebView: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // === Logout popup ===
  logoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoutCard: {
    backgroundColor: colors.neutral[900],
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    gap: 8,
  },
  logoutCardTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: 30,
    color: colors.white[100],
    marginTop: 8,
  },
  logoutCardSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[40],
  },
  logoutCardButtons: {
    gap: 8,
    marginTop: 16,
  },
  logoutStayBtn: {
    height: 52,
    borderRadius: 43,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutStayText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[100],
  },
  logoutConfirmBtn: {
    height: 52,
    borderRadius: 43,
    backgroundColor: 'rgba(255, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutConfirmText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: '#FF2626',
  },
});
