import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  BotIcon,
  CalendarRangeIcon,
  ChartPieIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  RepeatIcon,
  SettingsIcon,
  TargetIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TranslationKey } from '@/lib/i18n';

export type AppNavItem = {
  titleKey: TranslationKey;
  url: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const appPrimaryNav: Array<AppNavItem> = [
  {
    titleKey: 'nav.dashboard',
    url: '/app',
    icon: LayoutDashboardIcon,
    exact: true,
  },
  {
    titleKey: 'nav.plan',
    url: '/app/plan',
    icon: ListChecksIcon,
  },
  {
    titleKey: 'nav.reports',
    url: '/app/reports',
    icon: ChartPieIcon,
  },
  {
    titleKey: 'nav.transactions',
    url: '/app/transactions',
    icon: ArrowLeftRightIcon,
  },
  {
    titleKey: 'nav.planning',
    url: '/app/planning',
    icon: CalendarRangeIcon,
  },
];

export const appToolsNav: { labelKey: TranslationKey; items: Array<AppNavItem> } = {
  labelKey: 'nav.tools',
  items: [
    {
      titleKey: 'nav.forecast',
      url: '/app/forecast',
      icon: TrendingUpIcon,
    },
    {
      titleKey: 'nav.goals',
      url: '/app/goals',
      icon: TargetIcon,
    },
    {
      titleKey: 'nav.subscriptions',
      url: '/app/subscriptions',
      icon: RepeatIcon,
    },
  ],
};

export function isAnalystEnabled(): boolean {
  return import.meta.env.VITE_ANALYST_ENABLED === 'true';
}

export const analystNavItem: AppNavItem = {
  titleKey: 'nav.analyst',
  url: '/app/analyst',
  icon: BotIcon,
};

export const appFooterNav: Array<AppNavItem> = [
  {
    titleKey: 'nav.settings',
    url: '/app/settings',
    icon: SettingsIcon,
  },
  {
    titleKey: 'nav.docs',
    url: '/app/docs',
    icon: BookOpenIcon,
  },
  analystNavItem,
];

// Nested under Settings in the sidebar. `exact` so it does not claim /app/accounts/$accountId,
// which belongs to the account rows.
export const bankConnectionsNavItem: AppNavItem = {
  titleKey: 'nav.accounts',
  url: '/app/settings/bank-connections',
  icon: LandmarkIcon,
  exact: true,
};

export const allNavItems: Array<AppNavItem> = [
  ...appPrimaryNav,
  ...appToolsNav.items,
  ...appFooterNav,
  bankConnectionsNavItem,
];

export function isNavItemActive(item: AppNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.url;
  }

  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}
