import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { colors } from '../../shared/constants';
import { useTabBarVisibility } from './tabBarVisibility';
import type {
  MainTabParamList,
  HomeStackParamList,
  TasksStackParamList,
  MonitoringStackParamList,
  ProfileStackParamList,
} from '../../shared/types';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Screens
import { HomeScreen } from '../../features/transactions/screens/HomeScreen';
import { TransactionsScreen } from '../../features/transactions/screens/TransactionsScreen';
import { AddTransactionScreen } from '../../features/transactions/screens/AddTransactionScreen';
import { TransactionDetailScreen } from '../../features/transactions/screens/TransactionDetailScreen';
import { TasksScreen } from '../../features/tasks/screens/TasksScreen';
import { AnalyticsScreen } from '../../features/analytics/screens/AnalyticsScreen';
import { IncomeAnalyticsScreen } from '../../features/analytics/screens/IncomeAnalyticsScreen';
import { SpendingCategoryDetailScreen } from '../../features/analytics/screens/SpendingCategoryDetailScreen';
import { TransactionReviewScreen } from '../../features/analytics/screens/TransactionReviewScreen';
import { ProfileScreen } from '../../features/profile/screens/ProfileScreen';
import { SettingsScreen } from '../../features/profile/screens/SettingsScreen';
import { CategoriesScreen } from '../../features/categories/screens/CategoriesScreen';
import { CategoryDetailScreen } from '../../features/categories/screens/CategoryDetailScreen';
import { CreateCategoryScreen } from '../../features/categories/screens/CreateCategoryScreen';
import { SubscriptionManagementScreen } from '../../features/profile/screens/SubscriptionManagementScreen';
import { BudgetsScreen } from '../../features/budget/screens/BudgetsScreen';
import { BudgetDetailScreen } from '../../features/budget/screens/BudgetDetailScreen';
import { BudgetAlertsScreen } from '../../features/budget/screens/BudgetAlertsScreen';
import { CreateBudgetScreen } from '../../features/budget/screens/CreateBudgetScreen';
import { RecurringsScreen } from '../../features/recurring/screens/RecurringsScreen';
import { CreateRecurringScreen } from '../../features/recurring/screens/CreateRecurringScreen';
import { DebtsScreen } from '../../features/debts/screens/DebtsScreen';
import { CreateDebtScreen } from '../../features/debts/screens/CreateDebtScreen';
import { DebtDetailScreen } from '../../features/debts/screens/DebtDetailScreen';
import { AddRepaymentScreen } from '../../features/debts/screens/AddRepaymentScreen';

/* ── Constants ── */
const INACTIVE_COLOR = '#828187';
const ACTIVE_COLOR = '#FFFFFF';
const TAB_GAP = 12;
const ICON_TEXT_GAP = 6;

/* ── SVG Icons (Solar Icon Set — Bold) ── */

const HomeIcon = React.memo(({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M22 22L2 22"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <Path
      d="M3 11.3472V22H21V11.3472C21 10.4903 20.6336 9.67426 19.9931 9.10496L13.9931 3.77163C12.8564 2.76126 11.1436 2.76126 10.0069 3.77163L4.00691 9.10496C3.36644 9.67426 3 10.4903 3 11.3472Z"
      fill={color}
    />
  </Svg>
));
HomeIcon.displayName = 'HomeIcon';

const TasksIcon = React.memo(({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 7.28595 22 4.92893 20.5355 3.46447C19.0711 2 16.714 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447ZM10.5858 7.26426C10.8238 7.01431 10.8142 6.61879 10.5642 6.38073C10.3142 6.14268 9.9186 6.15226 9.6806 6.40222L7.75224 8.42693L7.25236 7.90222C7.01436 7.65226 6.61882 7.64268 6.36882 7.88073C6.11882 8.11879 6.10924 8.51431 6.34724 8.76426L7.29964 9.76426C7.41764 9.88815 7.58124 9.95833 7.75224 9.95833C7.92324 9.95833 8.08684 9.88815 8.20484 9.76426L10.5858 7.26426ZM12.8332 7.87499C12.488 7.87499 12.2082 8.15481 12.2082 8.49999C12.2082 8.84517 12.488 9.12499 12.8332 9.12499H16.9998C17.345 9.12499 17.6248 8.84517 17.6248 8.49999C17.6248 8.15481 17.345 7.87499 16.9998 7.87499H12.8332ZM10.5858 14.0977C10.8238 13.8477 10.8142 13.4521 10.5642 13.214C10.3142 12.976 9.9186 12.9856 9.6806 13.2356L7.75224 15.2604L7.25236 14.7356C7.01436 14.4856 6.61882 14.476 6.36882 14.714C6.11882 14.9521 6.10924 15.3477 6.34724 15.5977L7.29964 16.5977C7.41764 16.7215 7.58124 16.7916 7.75224 16.7916C7.92324 16.7916 8.08684 16.7215 8.20484 16.5977L10.5858 14.0977ZM12.8332 14.7083C12.488 14.7083 12.2082 14.9881 12.2082 15.3333C12.2082 15.6785 12.488 15.9583 12.8332 15.9583H16.9998C17.345 15.9583 17.6248 15.6785 17.6248 15.3333C17.6248 14.9881 17.345 14.7083 16.9998 14.7083H12.8332Z"
      fill={color}
    />
  </Svg>
));
TasksIcon.displayName = 'TasksIcon';

const MonitoringIcon = React.memo(({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 7.28595 22 4.92893 20.5355 3.46447C19.0711 2 16.714 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447ZM17 12.25C17.4142 12.25 17.75 12.5858 17.75 13V18C17.75 18.4142 17.4142 18.75 17 18.75C16.5858 18.75 16.25 18.4142 16.25 18V13C16.25 12.5858 16.5858 12.25 17 12.25ZM12.75 6C12.75 5.58579 12.4142 5.25 12 5.25C11.5858 5.25 11.25 5.58579 11.25 6V18C11.25 18.4142 11.5858 18.75 12 18.75C12.4142 18.75 12.75 18.4142 12.75 18V6ZM7 8.25C7.41421 8.25 7.75 8.58579 7.75 9V18C7.75 18.4142 7.41421 18.75 7 18.75C6.58579 18.75 6.25 18.4142 6.25 18V9C6.25 8.58579 6.58579 8.25 7 8.25Z"
      fill={color}
    />
  </Svg>
));
MonitoringIcon.displayName = 'MonitoringIcon';

const ProfileIcon = React.memo(({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={6} r={4} fill={color} />
    <Ellipse cx={12} cy={17} rx={7} ry={4} fill={color} />
  </Svg>
));
ProfileIcon.displayName = 'ProfileIcon';

/* ── Stack Navigators ── */
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const MonitoringStack = createNativeStackNavigator<MonitoringStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
};

const HomeStackNavigator = () => (
  <HomeStack.Navigator screenOptions={stackScreenOptions}>
    <HomeStack.Screen name="Home" component={HomeScreen} />
    <HomeStack.Screen name="Transactions" component={TransactionsScreen} />
    <HomeStack.Screen name="AddTransaction" component={AddTransactionScreen} />
    <HomeStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
    <HomeStack.Screen name="Budgets" component={BudgetsScreen} />
    <HomeStack.Screen name="BudgetAlerts" component={BudgetAlertsScreen} />
    <HomeStack.Screen name="BudgetDetail" component={BudgetDetailScreen} />
    <HomeStack.Screen name="CreateBudget" component={CreateBudgetScreen} />
  </HomeStack.Navigator>
);

const TasksStackNavigator = () => (
  <TasksStack.Navigator screenOptions={stackScreenOptions}>
    <TasksStack.Screen name="Tasks" component={TasksScreen} />
    <TasksStack.Screen name="Recurrings" component={RecurringsScreen} />
    <TasksStack.Screen name="CreateRecurring" component={CreateRecurringScreen} />
    <TasksStack.Screen name="Debts" component={DebtsScreen} />
    <TasksStack.Screen name="CreateDebt" component={CreateDebtScreen} />
    <TasksStack.Screen name="DebtDetail" component={DebtDetailScreen} />
    <TasksStack.Screen name="AddRepayment" component={AddRepaymentScreen} />
  </TasksStack.Navigator>
);

const MonitoringStackNavigator = () => (
  <MonitoringStack.Navigator screenOptions={stackScreenOptions}>
    <MonitoringStack.Screen name="Analytics" component={AnalyticsScreen} />
    <MonitoringStack.Screen name="IncomeAnalytics" component={IncomeAnalyticsScreen} />
    <MonitoringStack.Screen name="SpendingCategoryDetail" component={SpendingCategoryDetailScreen} />
    <MonitoringStack.Screen name="TransactionReview" component={TransactionReviewScreen} />
  </MonitoringStack.Navigator>
);

const ProfileStackNavigator = () => (
  <ProfileStack.Navigator screenOptions={stackScreenOptions}>
    <ProfileStack.Screen name="Profile" component={ProfileScreen} />
    <ProfileStack.Screen name="Settings" component={SettingsScreen} />
    <ProfileStack.Screen name="Categories" component={CategoriesScreen} />
    <ProfileStack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
    <ProfileStack.Screen name="CreateCategory" component={CreateCategoryScreen} />
    <ProfileStack.Screen
      name="SubscriptionManagement"
      component={SubscriptionManagementScreen}
      options={{
        animation: 'fade_from_bottom',
        animationDuration: 300,
      }}
    />
  </ProfileStack.Navigator>
);

/* ── Screens where tab bar should be hidden ── */
const HIDE_TAB_BAR_SCREENS = new Set(['SubscriptionManagement']);

/* ── Tab Config ── */
const TAB_CONFIG: Record<
  string,
  { icon: React.FC<{ color: string }>; labelKey: string }
> = {
  HomeTab: { icon: HomeIcon, labelKey: 'tabs.home' },
  MonitoringTab: { icon: MonitoringIcon, labelKey: 'tabs.monitoring' },
  TasksTab: { icon: TasksIcon, labelKey: 'tabs.tasks' },
  ProfileTab: { icon: ProfileIcon, labelKey: 'tabs.profile' },
};

/* ── Custom Tab Bar ── */
/*
 * Key performance principle: the tab bar is ALWAYS mounted.
 * Instead of `return null` / `display: 'none'` (which unmounts the component
 * and causes layout recalculation + jank on re-mount), we use Animated opacity
 * with useNativeDriver (runs on native thread) + pointerEvents to prevent
 * interaction when hidden.
 */
const CustomTabBar = React.memo(({ state, navigation, descriptors }: BottomTabBarProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Imperative hiding from modals (HomeScreen budget, ProfileScreen pickers)
  const modalHidden = useTabBarVisibility((s) => s.hidden);

  // Route-based hiding (e.g., SubscriptionManagement)
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key].options;
  const routeHidden = (focusedOptions.tabBarStyle as { display?: string } | undefined)?.display === 'none';

  const shouldHide = modalHidden || routeHidden;

  // Animated opacity — runs on native thread, zero React re-renders for the animation
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (shouldHide) {
      // Instant hide — tab bar must disappear BEFORE modal overlay renders
      opacityAnim.setValue(0);
    } else {
      // Smooth show — fade in when modal closes
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldHide, opacityAnim]);

  return (
    <Animated.View
      style={[styles.tabBar, { paddingBottom: insets.bottom, opacity: opacityAnim }]}
      pointerEvents={shouldHide ? 'none' : 'auto'}
    >
      <View style={styles.tabContainer}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;
          const config = TAB_CONFIG[route.name];
          if (!config) return null;

          const { icon: IconComponent, labelKey } = config;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={t(labelKey)}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <IconComponent color={color} />
              <Text style={[styles.tabLabel, { color }]} numberOfLines={1} ellipsizeMode="tail">{t(labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
});
CustomTabBar.displayName = 'CustomTabBar';

/* ── Tab Navigator ── */
const Tab = createBottomTabNavigator<MainTabParamList>();

export const TabNavigator = () => (
  <Tab.Navigator
    tabBar={(props) => <CustomTabBar {...props} />}
    screenOptions={{ headerShown: false, animation: 'fade' }}
  >
    <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
    <Tab.Screen name="MonitoringTab" component={MonitoringStackNavigator} />
    <Tab.Screen name="TasksTab" component={TasksStackNavigator} />
    <Tab.Screen
      name="ProfileTab"
      component={ProfileStackNavigator}
      options={({ route }) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'Profile';
        return {
          tabBarStyle: HIDE_TAB_BAR_SCREENS.has(routeName)
            ? { display: 'none' as const }
            : undefined,
        };
      }}
    />
  </Tab.Navigator>
);

/* ── Styles ── */
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: TAB_GAP,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_TEXT_GAP,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});
