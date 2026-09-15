import {
  ArrowUpDownIcon,
  BackpackIcon,
  BadgePercentIcon,
  BanknoteArrowUpIcon,
  BanknoteIcon,
  BoltIcon,
  BriefcaseBusinessIcon,
  CarIcon,
  CircleIcon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  HandHeartIcon,
  HeartPulseIcon,
  HomeIcon,
  LandmarkIcon,
  PercentIcon,
  PiggyBankIcon,
  PlaneIcon,
  PlusCircleIcon,
  ReceiptIcon,
  RepeatIcon,
  RotateCcwIcon,
  SendIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  TicketIcon,
  UmbrellaIcon,
  UtensilsIcon,
  WalletCardsIcon,
  WrenchIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IconName } from 'lucide-react/dynamic';
import type { Doc } from '../../convex/_generated/dataModel';
import type { I18nContextValue, TranslationKey } from './i18n';

type CategoryKind = Doc<'categories'>['kind'];
// A category's primary `kind` is 'expense' | 'income' | 'transfer'. Some
// system categories (e.g. Loans) also apply to 'internal'-classified
// transactions (loan/mortgage repayments) via `applicableKinds`, without
// their primary `kind` changing.
type ApplicableCategoryKind = CategoryKind | 'internal';
type CategoryNameSource = Pick<Doc<'categories'>, 'name' | 'systemKey'>;

const categoryTranslationKeys = {
  'category:deposits': 'categories.system.deposits',
  'category:gift': 'categories.system.gift',
  'category:services': 'categories.system.services',
  'category:cashback': 'categories.system.cashback',
  'category:savings': 'categories.system.savings',
  'category:donations': 'categories.system.donations',
  'category:remittances': 'categories.system.remittances',
} as const satisfies Record<string, TranslationKey>;

const categoryKindTranslationKeys = {
  expense: 'settings.categories.kind.expense',
  income: 'settings.categories.kind.income',
  transfer: 'settings.categories.kind.transfer',
  internal: 'settings.categories.kind.internal',
} as const satisfies Record<ApplicableCategoryKind, TranslationKey>;

export const CATEGORY_ICON_OPTIONS = [
  { name: 'circle', icon: CircleIcon },
  { name: 'home', icon: HomeIcon },
  { name: 'shopping-basket', icon: ShoppingBasketIcon },
  { name: 'shopping-bag', icon: ShoppingBagIcon },
  { name: 'utensils', icon: UtensilsIcon },
  { name: 'car', icon: CarIcon },
  { name: 'plane', icon: PlaneIcon },
  { name: 'bolt', icon: BoltIcon },
  { name: 'heart-pulse', icon: HeartPulseIcon },
  { name: 'umbrella', icon: UmbrellaIcon },
  { name: 'repeat', icon: RepeatIcon },
  { name: 'ticket', icon: TicketIcon },
  { name: 'graduation-cap', icon: GraduationCapIcon },
  { name: 'backpack', icon: BackpackIcon },
  { name: 'landmark', icon: LandmarkIcon },
  { name: 'receipt', icon: ReceiptIcon },
  { name: 'hand-coins', icon: HandCoinsIcon },
  { name: 'banknote', icon: BanknoteIcon },
  { name: 'banknote-arrow-up', icon: BanknoteArrowUpIcon },
  { name: 'briefcase', icon: BriefcaseBusinessIcon },
  { name: 'percent', icon: PercentIcon },
  { name: 'rotate-ccw', icon: RotateCcwIcon },
  { name: 'plus-circle', icon: PlusCircleIcon },
  { name: 'arrow-up-down', icon: ArrowUpDownIcon },
  { name: 'piggy-bank', icon: PiggyBankIcon },
  { name: 'gift', icon: GiftIcon },
  { name: 'wrench', icon: WrenchIcon },
  { name: 'badge-percent', icon: BadgePercentIcon },
  { name: 'hand-heart', icon: HandHeartIcon },
  { name: 'send', icon: SendIcon },
  { name: 'wallet-cards', icon: WalletCardsIcon },
] as const satisfies ReadonlyArray<{ name: string; icon: LucideIcon }>;

const categoryIcons = new Map<string, LucideIcon>(CATEGORY_ICON_OPTIONS.map((option) => [option.name, option.icon]));

export const CATEGORY_ICON_SEARCH_LIMIT = 80;

let categoryIconNamesPromise: Promise<ReadonlyArray<IconName>> | undefined;

export function loadCategoryIconNames(): Promise<ReadonlyArray<IconName>> {
  categoryIconNamesPromise ??= import('lucide-react/dynamicIconImports').then(({ default: dynamicIconImports }) => {
    return Object.keys(dynamicIconImports) as Array<IconName>;
  });
  return categoryIconNamesPromise;
}

export function searchCategoryIconNames<T extends string>(
  iconNames: ReadonlyArray<T>,
  query: string,
  limit = CATEGORY_ICON_SEARCH_LIMIT,
) {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '-');
  if (!normalizedQuery) return { matches: [] as Array<T>, total: 0 };

  const prefixMatches: Array<T> = [];
  const substringMatches: Array<T> = [];
  for (const name of iconNames) {
    if (name.startsWith(normalizedQuery)) {
      prefixMatches.push(name);
    } else if (name.includes(normalizedQuery)) {
      substringMatches.push(name);
    }
  }

  const matches = [...prefixMatches, ...substringMatches];
  return { matches: matches.slice(0, Math.max(0, limit)), total: matches.length };
}

export function categoryIconIsCurated(name: string | undefined) {
  return name ? categoryIcons.has(name) : false;
}

export function categoryIconForName(name: string | undefined): LucideIcon {
  return (name ? categoryIcons.get(name) : undefined) ?? CircleIcon;
}

export function categoryIconForeground(color: string | undefined) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return '#ffffff';
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160 ? '#171717' : '#ffffff';
}

export function categoryApplicableKinds(
  category: Pick<Doc<'categories'>, 'kind' | 'applicableKinds'>,
): Array<ApplicableCategoryKind> {
  return category.applicableKinds ?? [category.kind];
}

export function categorySupportsKind(
  category: Pick<Doc<'categories'>, 'kind' | 'applicableKinds'>,
  kind: ApplicableCategoryKind,
) {
  return categoryApplicableKinds(category).includes(kind);
}

export function categoryDisplayName(category: CategoryNameSource, t: I18nContextValue['t']) {
  const translationKey = category.systemKey
    ? categoryTranslationKeys[category.systemKey as keyof typeof categoryTranslationKeys]
    : undefined;
  return translationKey ? t(translationKey) : category.name;
}

export function categoryKindDisplayName(kind: ApplicableCategoryKind, t: I18nContextValue['t']) {
  return t(categoryKindTranslationKeys[kind]);
}
