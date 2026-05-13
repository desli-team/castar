/**
 * Castar — Telegram Auth Screen (Figma design)
 *
 * Waiting screen shown while the user authenticates via Telegram in the browser.
 * Uses the same background glow as OnboardingScreen for visual consistency.
 *
 * Flow:
 *   1. Screen mounts → opens Worker /auth/telegram in an in-app WebView
 *   2. Browser shows Telegram Login Widget → user taps → Telegram OAuth
 *   3. User confirms → Telegram redirects to Worker callback with auth params
 *   4. Worker validates HMAC, creates JWT, redirects to castar://auth/callback?...
 *   5. OS catches castar:// deep link → opens app
 *   6. Linking event fires → we parse token + user → loginWithTelegram() → SetName
 *
 * WebView is required for Expo Go/device QA because Expo Go cannot own the
 * production castar:// scheme. We intercept the callback page link instead.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  AppState,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { WebView } from 'react-native-webview';

import { colors, fontFamily, grid } from '../../../shared/constants';
import { scale, GLOW_RENDER_SIZE, GLOW2_RENDER_SIZE } from '../../../shared/constants/scaling';
import type { AuthStackParamList } from '../../../shared/types';
import { useAuthStore } from '../store/authStore';
import type { TelegramUser } from '../services/telegramAuth';
import {
  getTelegramAuthUrl,
  isAuthCallback,
  parseAuthCallback,
} from '../services/telegramAuth';
import { GlowCircle1, GlowCircle2, LogoIcon } from '../../../shared/components/svg/AuthSvgs';

// ============================
// Local JSX SVG Icons (unique to this screen)
// ============================

// Telegram icon — 48x48, white circle with Telegram plane
const TelegramIcon = React.memo(() => (
  <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
    <G clipPath="url(#clip0_163_654)">
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 24C48 37.2548 37.2548 48 24 48C10.7452 48 0 37.2548 0 24C0 10.7452 10.7452 0 24 0C37.2548 0 48 10.7452 48 24ZM24.8601 17.7179C22.5257 18.6888 17.8603 20.6984 10.8638 23.7466C9.72766 24.1984 9.13251 24.6404 9.07834 25.0726C8.98677 25.803 9.90142 26.0906 11.1469 26.4822C11.3164 26.5355 11.4919 26.5907 11.6719 26.6492C12.8973 27.0475 14.5457 27.5135 15.4026 27.5321C16.1799 27.5489 17.0475 27.2284 18.0053 26.5707C24.5423 22.158 27.9168 19.9276 28.1286 19.8795C28.2781 19.8456 28.4852 19.803 28.6255 19.9277C28.7659 20.0524 28.7521 20.2886 28.7372 20.352C28.6466 20.7383 25.0562 24.0762 23.1982 25.8036C22.619 26.3421 22.2081 26.724 22.1242 26.8113C21.936 27.0067 21.7443 27.1915 21.56 27.3692C20.4215 28.4667 19.5678 29.2896 21.6072 30.6336C22.5873 31.2794 23.3715 31.8135 24.1539 32.3463C25.0084 32.9282 25.8606 33.5085 26.9632 34.2313C27.2442 34.4155 27.5125 34.6068 27.7738 34.7931C28.7681 35.5019 29.6615 36.1388 30.7652 36.0373C31.4065 35.9782 32.0689 35.3752 32.4053 33.5767C33.2004 29.3263 34.7633 20.1169 35.1244 16.3219C35.1561 15.9895 35.1163 15.5639 35.0843 15.3771C35.0523 15.1904 34.9855 14.9242 34.7427 14.7272C34.4552 14.4939 34.0113 14.4447 33.8127 14.4482C32.91 14.4641 31.5251 14.9456 24.8601 17.7179Z" fill="white" />
    </G>
    <Defs>
      <ClipPath id="clip0_163_654">
        <Rect width={48} height={48} fill="white" />
      </ClipPath>
    </Defs>
  </Svg>
));
TelegramIcon.displayName = 'TelegramIcon';

// ============================
// Component
// ============================

export const TelegramAuthScreen = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const loginWithTelegram = useAuthStore((s) => s.loginWithTelegram);

  const [error, setError] = useState<string | null>(null);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [showTelegramWebView, setShowTelegramWebView] = useState(false);
  const handledCallback = useRef(false);

  // Pulsing dots animation — opacity oscillates 0.3 → 1 → 0.3
  const dotsOpacity = useSharedValue(0.3);

  useEffect(() => {
    dotsOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
      false,
    );
  }, [dotsOpacity]);

  const dotsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotsOpacity.value,
  }));

  /**
   * Handle a successful auth callback — parse data and navigate.
   */
  const handleAuthResult = useCallback(
    (token: string, user: TelegramUser) => {
      if (handledCallback.current) return;
      handledCallback.current = true;

      loginWithTelegram(token, user).then(() => {
        // If loginWithTelegram detected a returning user, isOnboarded is already true
        // and RootNavigator will automatically switch to Main.
        // For new users, isOnboarded is still false → navigate to SetName.
        const { isOnboarded } = useAuthStore.getState();
        if (!isOnboarded) {
          navigation.replace('SetName', { from: 'telegram' });
        }
        // else: RootNavigator will handle the switch to Main
      });
    },
    [loginWithTelegram, navigation],
  );

  /**
   * Open Telegram auth in an in-app WebView. This works in Expo Go because we
   * capture the generated castar:// callback URL before the OS has to resolve it.
   */
  const openBrowserAuth = useCallback(() => {
    setError(null);
    handledCallback.current = false;
    setShowTelegramWebView(true);
    setBrowserOpened(true);
  }, []);

  const handleCallbackUrl = useCallback(
    (url: string) => {
      if (!isAuthCallback(url)) return false;
      const result = parseAuthCallback(url);
      if (result) {
        setShowTelegramWebView(false);
        handleAuthResult(result.token, result.user);
      } else {
        setError(t('auth.telegramAuthError') || 'Authentication failed. Please try again.');
      }
      return true;
    },
    [handleAuthResult, t],
  );

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      handleCallbackUrl(event.nativeEvent.data);
    },
    [handleCallbackUrl],
  );

  /**
   * Open browser on mount.
   */
  useEffect(() => {
    openBrowserAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Listen for deep links — this fires when the OS opens the app
   * via castar://auth/callback from the external browser.
   */
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (isAuthCallback(url)) {
        const result = parseAuthCallback(url);
        if (result) {
          handleAuthResult(result.token, result.user);
        } else {
          setError(
            t('auth.telegramAuthError') || 'Authentication failed. Please try again.',
          );
        }
      }
    };

    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Also check if the app was opened with a deep link (cold start)
    Linking.getInitialURL().then((url) => {
      if (url && isAuthCallback(url)) {
        const result = parseAuthCallback(url);
        if (result) {
          handleAuthResult(result.token, result.user);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleAuthResult, t]);

  /**
   * When user comes back to the app from browser without completing auth,
   * they see the "Open Telegram again" button.
   */
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && browserOpened && !handledCallback.current) {
        // No-op: UI already shows "Open Telegram again" button
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [browserOpened]);

  // Navigate back to Onboarding
  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Background glow 1 — same position as OnboardingScreen */}
      <View style={styles.glowContainer} pointerEvents="none">
        <GlowCircle1 />
      </View>

      {/* Background glow 2 — same position as OnboardingScreen */}
      <View style={styles.glow2Container} pointerEvents="none">
        <GlowCircle2 />
      </View>

      {/* Logo — same position as OnboardingScreen */}
      <View style={styles.logoContainer}>
        <LogoIcon />
      </View>

      {/* Single centered container: icon + text + buttons */}
      <View style={styles.centerContent}>
        {error ? (
          /* Error state */
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerBlock}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={openBrowserAuth}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>
                {t('common.retry') || 'Try Again'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          /* Waiting state: Icon → 60px → Text → 60px → Buttons */
          <View style={styles.centerBlock}>
            {/* Telegram icon */}
            <TelegramIcon />

            {/* 60px gap between icon and text */}
            <View style={styles.spacer60} />

            {/* Line 1 — "Ожидание" / "Waiting" (always on its own line) */}
            <Text style={styles.waitingTitle}>
              {t('auth.waitingLine1') || 'Waiting'}
            </Text>

            {/* Line 2 — "Telegram..." with animated dots */}
            <View style={styles.titleRow}>
              <Text style={styles.waitingTitle}>
                {t('auth.waitingLine2') || 'Telegram'}
              </Text>
              <Animated.Text style={[styles.waitingDots, dotsAnimatedStyle]}>
                ...
              </Animated.Text>
            </View>

            {/* Subtitle — 16 regular, white 40%, width 277 */}
            <Text style={styles.waitingSubtitle}>
              {t('auth.telegramBrowserHint') ||
                'Complete authentication in the browser and you will be redirected back to the app.'}
            </Text>

            {/* 60px gap between text and buttons */}
            <View style={styles.spacer60} />

            {/* Open Telegram again — secondary button style */}
            <TouchableOpacity
              style={styles.openAgainButton}
              onPress={openBrowserAuth}
              activeOpacity={0.7}
            >
              <Text style={styles.openAgainButtonText}>
                {t('auth.openTelegramAgain') || 'Open Telegram again'}
              </Text>
            </TouchableOpacity>

            {/* Cancel — same shape as Open button, but no background */}
            <View style={styles.buttonGap} />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.6}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.cancel') || 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

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
            onShouldStartLoadWithRequest={(request) => !handleCallbackUrl(request.url)}
            injectedJavaScript={`
              document.addEventListener('click', function(e) {
                var el = e.target;
                while (el && el.tagName !== 'A') el = el.parentElement;
                if (el && el.href && el.href.startsWith('castar://')) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.ReactNativeWebView.postMessage(el.href);
                }
              }, true);
              (function() {
                var checkInterval = setInterval(function() {
                  var links = document.querySelectorAll('a[href^="castar://"]');
                  if (links.length > 0) {
                    clearInterval(checkInterval);
                    window.ReactNativeWebView.postMessage(links[0].href);
                  }
                }, 300);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // === Glow — same as OnboardingScreen ===
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

  // === Logo — same as OnboardingScreen ===
  logoContainer: {
    position: 'absolute',
    left: scale(171.22),
    top: scale(78),
    zIndex: 10,
  },

  // === Center content (single centered container for everything) ===
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: grid.margin,
  },
  centerBlock: {
    alignItems: 'center',
    width: '100%',
  },

  // === Waiting state ===
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  waitingTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 32,
    lineHeight: 40,
    color: colors.white[100],
    textAlign: 'center',
  },
  waitingDots: {
    fontFamily: fontFamily.medium,
    fontSize: 32,
    lineHeight: 40,
    color: colors.white[100],
  },
  waitingSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[40],
    textAlign: 'center',
    marginTop: 8,
    width: scale(277),
  },
  spacer60: {
    height: 60,
  },
  buttonGap: {
    height: 16,
  },

  // === Error state ===
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white[50],
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 43,
  },
  retryButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.white[100],
  },

  // "Open Telegram again" — same style as OnboardingScreen secondary button
  openAgainButton: {
    width: '100%',
    height: 51,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openAgainButtonText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[100],
  },

  // "Cancel" — same shape as Open button, but no background
  cancelButton: {
    width: '100%',
    height: 51,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white[50],
  },

  telegramWebViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  telegramWebViewHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  telegramWebViewClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telegramWebViewCloseText: {
    color: colors.white[100],
    fontSize: 22,
    fontFamily: fontFamily.medium,
  },
  telegramWebViewTitle: {
    color: colors.white[100],
    fontSize: 17,
    fontFamily: fontFamily.medium,
  },
  telegramWebView: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
