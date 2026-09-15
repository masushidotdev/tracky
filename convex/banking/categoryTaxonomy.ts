import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type CategoryKind = 'expense' | 'income' | 'transfer';
// A category's primary `kind` is always one of the three above (matches the
// transactions it can be created/edited for). `applicableKinds` can widen
// that to 'internal' so a category stays attached to internal-classified
// transactions (loan/mortgage repayments) without forcing a reclassification —
// see categoryKindForClassification/classificationKindForCategory.
export type ApplicableCategoryKind = CategoryKind | 'internal';

export type DefaultCategoryDefinition = {
  systemKey: string;
  name: string;
  kind: CategoryKind;
  applicableKinds?: Array<ApplicableCategoryKind>;
  color: string;
  icon: string;
  budgetEligible: boolean;
};

type CategoryInferenceInput = {
  direction: 'CRDT' | 'DBIT';
  description: string;
  counterpartyName?: string | null;
  merchantCategoryCode?: string | null;
  remittanceInformation?: Array<string>;
  bankTransactionCode?: string | null;
};

export const DEFAULT_CATEGORIES: Array<DefaultCategoryDefinition> = [
  {
    systemKey: 'expense:housing',
    name: 'Housing',
    kind: 'expense',
    color: '#2563eb',
    icon: 'home',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:groceries',
    name: 'Groceries',
    kind: 'expense',
    color: '#16a34a',
    icon: 'shopping-basket',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:dining',
    name: 'Dining',
    kind: 'expense',
    color: '#f97316',
    icon: 'utensils',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:transport',
    name: 'Transport',
    kind: 'expense',
    color: '#0ea5e9',
    icon: 'car',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:utilities',
    name: 'Utilities',
    kind: 'expense',
    color: '#7c3aed',
    icon: 'bolt',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:healthcare',
    name: 'Healthcare',
    kind: 'expense',
    color: '#dc2626',
    icon: 'heart-pulse',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:insurance',
    name: 'Insurance',
    kind: 'expense',
    color: '#fff647',
    icon: 'umbrella',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:subscriptions',
    name: 'Subscriptions',
    kind: 'expense',
    color: '#9333ea',
    icon: 'repeat',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:shopping',
    name: 'Shopping',
    kind: 'expense',
    color: '#db2777',
    icon: 'shopping-bag',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:travel',
    name: 'Travel',
    kind: 'expense',
    color: '#0284c7',
    icon: 'plane',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:entertainment',
    name: 'Entertainment',
    kind: 'expense',
    color: '#ca8a04',
    icon: 'ticket',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:education',
    name: 'Education',
    kind: 'expense',
    color: '#4f46e5',
    icon: 'graduation-cap',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:child_allowance',
    name: 'Child allowance',
    kind: 'expense',
    color: '#ff92ebff',
    icon: 'backpack',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:taxes',
    name: 'Taxes',
    kind: 'expense',
    color: '#475569',
    icon: 'landmark',
    budgetEligible: true,
  },
  { systemKey: 'expense:fees', name: 'Fees', kind: 'expense', color: '#64748b', icon: 'receipt', budgetEligible: true },
  {
    systemKey: 'expense:loans',
    name: 'Loans',
    kind: 'expense',
    // Also usable on 'internal'-classified transactions (mutuo/prestito/rateale
    // repayments with no linked CARD account) so the category can be kept
    // without forcing a reclassification to 'expense' and double-counting.
    applicableKinds: ['expense', 'internal'],
    color: '#64748b',
    icon: 'hand-coins',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:cash',
    name: 'Cash withdrawals',
    kind: 'expense',
    color: '#525252',
    icon: 'banknote',
    budgetEligible: true,
  },
  {
    systemKey: 'expense:other',
    name: 'Other expenses',
    kind: 'expense',
    color: '#71717a',
    icon: 'circle',
    budgetEligible: true,
  },
  {
    systemKey: 'income:salary',
    name: 'Salary',
    kind: 'income',
    color: '#059669',
    icon: 'briefcase',
    budgetEligible: false,
  },
  {
    systemKey: 'income:interest',
    name: 'Interest',
    kind: 'income',
    color: '#0d9488',
    icon: 'percent',
    budgetEligible: false,
  },
  {
    systemKey: 'income:refunds',
    name: 'Refunds',
    kind: 'income',
    color: '#65a30d',
    icon: 'rotate-ccw',
    budgetEligible: false,
  },
  {
    systemKey: 'income:other',
    name: 'Other income',
    kind: 'income',
    color: '#15803d',
    icon: 'plus-circle',
    budgetEligible: false,
  },
  {
    systemKey: 'transfer:topup',
    name: 'Top-Up',
    kind: 'transfer',
    color: '#15803d',
    icon: 'banknote-arrow-up',
    budgetEligible: false,
  },
  {
    systemKey: 'transfer:unknown',
    name: 'Unknown',
    kind: 'transfer',
    color: '#15803d',
    icon: 'arrow-up-down',
    budgetEligible: false,
  },
  {
    systemKey: 'transfer:moneybox',
    name: 'MoneyBox',
    kind: 'transfer',
    color: '#15803d',
    icon: 'piggy-bank',
    budgetEligible: false,
  },
  {
    systemKey: 'category:deposits',
    name: 'Deposits',
    kind: 'income',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#0891b2',
    icon: 'landmark',
    budgetEligible: true,
  },
  {
    systemKey: 'category:gift',
    name: 'Gift',
    kind: 'expense',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#e11d48',
    icon: 'gift',
    budgetEligible: true,
  },
  {
    systemKey: 'category:services',
    name: 'Services',
    kind: 'expense',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#7c3aed',
    icon: 'wrench',
    budgetEligible: true,
  },
  {
    systemKey: 'category:cashback',
    name: 'Cashback',
    kind: 'income',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#65a30d',
    icon: 'badge-percent',
    budgetEligible: true,
  },
  {
    systemKey: 'category:savings',
    name: 'Savings',
    kind: 'transfer',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#0d9488',
    icon: 'piggy-bank',
    budgetEligible: true,
  },
  {
    systemKey: 'category:donations',
    name: 'Donations',
    kind: 'expense',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#db2777',
    icon: 'hand-heart',
    budgetEligible: true,
  },
  {
    systemKey: 'category:remittances',
    name: 'Remittances',
    kind: 'transfer',
    applicableKinds: ['expense', 'income', 'transfer'],
    color: '#4f46e5',
    icon: 'send',
    budgetEligible: true,
  },
];

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

// Category kind and classificationKind must stay in sync: every aggregation
// (Plan, planning cashflow, credit math) keys off classificationKind, so a
// transfer-kind category left on an income/expense classification silently
// keeps counting in the balance. These live here rather than in
// banking/transactions.ts because that module imports '../auth', which builds
// the AuthKit client at import time -- modules that only need the taxonomy
// rules (transferCore and its transitive importers) must not pay for it.
export function categoryKindForClassification(classificationKind: Doc<'transactions'>['classificationKind']) {
  if (classificationKind === 'income') return 'income' as const;
  if (classificationKind === 'expense' || classificationKind === 'subscription') return 'expense' as const;
  if (classificationKind === 'transfer') return 'transfer' as const;
  if (classificationKind === 'internal') return 'internal' as const;
  return null;
}

export function classificationKindForCategory(
  category: Pick<Doc<'categories'>, 'kind' | 'applicableKinds'>,
  currentClassificationKind: Doc<'transactions'>['classificationKind'],
): Exclude<Doc<'transactions'>['classificationKind'], 'uncategorized'> {
  const currentCategoryKind = categoryKindForClassification(currentClassificationKind);
  if (currentCategoryKind && categorySupportsKind(category, currentCategoryKind)) {
    return currentClassificationKind as Exclude<Doc<'transactions'>['classificationKind'], 'uncategorized'>;
  }
  if (category.kind === 'transfer') return 'transfer' as const;
  if (category.kind === 'income') return 'income' as const;
  return currentClassificationKind === 'subscription' ? ('subscription' as const) : ('expense' as const);
}

function namesMatch(left: string, right: string) {
  return normalizeText(left) === normalizeText(right);
}

export async function ensureDefaultCategoriesForUser(ctx: MutationCtx, userId: string) {
  const categoryIdsBySystemKey = new Map<string, Id<'categories'>>();
  const existingCategories = await ctx.db
    .query('categories')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(200);
  const existingBySystemKey = new Map(
    existingCategories.filter((category) => category.systemKey).map((category) => [category.systemKey!, category]),
  );

  for (const definition of DEFAULT_CATEGORIES) {
    const existing = existingBySystemKey.get(definition.systemKey);
    if (existing) {
      const applicableKinds = definition.applicableKinds ?? [definition.kind];
      const patch: Partial<
        Pick<
          Doc<'categories'>,
          'applicableKinds' | 'budgetEligible' | 'color' | 'icon' | 'kind' | 'name' | 'updatedAtMs'
        >
      > = {};
      if (
        !existing.applicableKinds ||
        existing.applicableKinds.length !== applicableKinds.length ||
        existing.applicableKinds.some((kind, index) => kind !== applicableKinds[index])
      ) {
        patch.applicableKinds = applicableKinds;
      }
      if (existing.name !== definition.name) patch.name = definition.name;
      if (existing.kind !== definition.kind) patch.kind = definition.kind;
      if (existing.color !== definition.color) patch.color = definition.color;
      if (existing.icon !== definition.icon) patch.icon = definition.icon;
      if (existing.budgetEligible !== definition.budgetEligible) patch.budgetEligible = definition.budgetEligible;
      if (Object.keys(patch).length > 0) {
        patch.updatedAtMs = Date.now();
        await ctx.db.patch('categories', existing._id, patch);
      }
      categoryIdsBySystemKey.set(definition.systemKey, existing._id);
      continue;
    }

    const matchingManualCategory = existingCategories.find(
      (category) =>
        !category.systemKey && category.kind === definition.kind && namesMatch(category.name, definition.name),
    );

    if (matchingManualCategory) {
      await ctx.db.patch('categories', matchingManualCategory._id, {
        systemKey: definition.systemKey,
        applicableKinds: definition.applicableKinds ?? [definition.kind],
        color: matchingManualCategory.color ?? definition.color,
        icon: matchingManualCategory.icon ?? definition.icon,
        budgetEligible: matchingManualCategory.budgetEligible || definition.budgetEligible,
        updatedAtMs: Date.now(),
      });
      categoryIdsBySystemKey.set(definition.systemKey, matchingManualCategory._id);
      continue;
    }

    const now = Date.now();
    const categoryId = await ctx.db.insert('categories', {
      userId,
      name: definition.name,
      systemKey: definition.systemKey,
      kind: definition.kind,
      applicableKinds: definition.applicableKinds ?? [definition.kind],
      color: definition.color,
      icon: definition.icon,
      budgetEligible: definition.budgetEligible,
      createdAtMs: now,
      updatedAtMs: now,
    });
    categoryIdsBySystemKey.set(definition.systemKey, categoryId);
  }

  return categoryIdsBySystemKey;
}

const mccRanges: Array<{ from: number; to: number; systemKey: string }> = [
  { from: 3000, to: 3299, systemKey: 'expense:travel' },
  { from: 3351, to: 3500, systemKey: 'expense:transport' },
  { from: 3501, to: 3999, systemKey: 'expense:travel' },
  { from: 4111, to: 4121, systemKey: 'expense:transport' },
  { from: 4131, to: 4131, systemKey: 'expense:transport' },
  { from: 4511, to: 4511, systemKey: 'expense:travel' },
  { from: 4722, to: 4789, systemKey: 'expense:travel' },
  { from: 4812, to: 4899, systemKey: 'expense:utilities' },
  { from: 4900, to: 4900, systemKey: 'expense:utilities' },
  { from: 5411, to: 5499, systemKey: 'expense:groceries' },
  { from: 5541, to: 5542, systemKey: 'expense:transport' },
  { from: 5811, to: 5814, systemKey: 'expense:dining' },
  { from: 5912, to: 5912, systemKey: 'expense:healthcare' },
  { from: 5200, to: 5599, systemKey: 'expense:shopping' },
  { from: 5651, to: 5999, systemKey: 'expense:shopping' },
  { from: 6010, to: 6011, systemKey: 'expense:cash' },
  { from: 6300, to: 6399, systemKey: 'expense:insurance' },
  { from: 7011, to: 7033, systemKey: 'expense:travel' },
  { from: 7832, to: 7999, systemKey: 'expense:entertainment' },
  { from: 8011, to: 8099, systemKey: 'expense:healthcare' },
  { from: 8211, to: 8299, systemKey: 'expense:education' },
  { from: 9211, to: 9399, systemKey: 'expense:taxes' },
];

const keywordRules: Array<{ systemKey: string; tokens: Array<string> }> = [
  {
    systemKey: 'expense:groceries',
    tokens: ['supermarket', 'grocery', 'groceries', 'esselunga', 'conad', 'coop', 'carrefour', 'lidl', 'aldi'],
  },
  {
    systemKey: 'expense:dining',
    tokens: ['restaurant', 'ristorante', 'bar ', 'cafe', 'caffe', 'pizzeria', 'deliveroo', 'glovo', 'just eat'],
  },
  {
    systemKey: 'expense:transport',
    tokens: [
      'fuel',
      'benzina',
      'diesel',
      'eni ',
      'q8',
      'ip ',
      'tamoil',
      'trenitalia',
      'italo',
      'uber',
      'taxi',
      'metro',
      'autostrade',
      'telepass',
    ],
  },
  {
    systemKey: 'expense:utilities',
    tokens: [
      'enel',
      'eni gas',
      'hera',
      'a2a',
      'acea',
      'bolletta',
      'utility',
      'vodafone',
      'tim ',
      'windtre',
      'iliad',
      'fastweb',
      'internet',
    ],
  },
  {
    systemKey: 'expense:healthcare',
    tokens: ['pharmacy', 'farmacia', 'doctor', 'medico', 'clinic', 'ospedale', 'health'],
  },
  {
    systemKey: 'expense:insurance',
    tokens: ['insurance', 'assicurazione', 'assicurazioni', 'allianz', 'generali', 'unipol', 'linear'],
  },
  {
    systemKey: 'expense:subscriptions',
    tokens: [
      'netflix',
      'spotify',
      'apple.com/bill',
      'google',
      'openai',
      'github',
      'notion',
      'figma',
      'adobe',
      'subscription',
      'abbonamento',
    ],
  },
  { systemKey: 'expense:shopping', tokens: ['amazon', 'zalando', 'ikea', 'decathlon', 'mediaworld', 'store', 'shop'] },
  {
    systemKey: 'expense:travel',
    tokens: ['hotel', 'booking.com', 'airbnb', 'ryanair', 'easyjet', 'ita airways', 'flight', 'viaggio'],
  },
  {
    systemKey: 'expense:entertainment',
    tokens: ['cinema', 'ticket', 'theatre', 'teatro', 'eventbrite', 'playstation', 'steam'],
  },
  {
    systemKey: 'expense:education',
    tokens: ['school', 'scuola', 'university', 'universita', 'course', 'corso', 'udemy'],
  },
  { systemKey: 'expense:child_allowance', tokens: ['mantenimento'] },
  { systemKey: 'expense:taxes', tokens: ['tax', 'tasse', 'agenzia entrate', 'f24', 'imposta'] },
  { systemKey: 'expense:fees', tokens: ['fee', 'commissione', 'comm.', 'canone', 'interest charge', 'spese banca'] },
  { systemKey: 'expense:cash', tokens: ['atm', 'cash withdrawal', 'prelievo'] },
  { systemKey: 'expense:loans', tokens: ['mutuo', 'rateale', 'loan', 'finanziamento'] },
  { systemKey: 'income:salary', tokens: ['salary', 'stipendio', 'payroll', 'bonifico stipendio', 'emolumenti'] },
  { systemKey: 'income:interest', tokens: ['interest', 'interessi'] },
  { systemKey: 'income:refunds', tokens: ['refund', 'rimborso', 'storno'] },
  { systemKey: 'category:cashback', tokens: ['cashback'] },
  { systemKey: 'category:deposits', tokens: ['deposit', 'deposito', 'versamento'] },
  { systemKey: 'category:gift', tokens: ['gift', 'regalo'] },
  { systemKey: 'category:donations', tokens: ['donation', 'donazione', 'charity', 'beneficenza'] },
  { systemKey: 'category:remittances', tokens: ['remittance', 'rimessa'] },
  { systemKey: 'transfer:topup', tokens: ['top-up', 'carica', 'ricarica', 'caricamento', 'caricamento di denaro'] },
  {
    systemKey: 'transfer:unknown',
    tokens: [
      'transfer',
      'transazione',
      'transazione di denaro',
      'transazione di denaro',
      'transazione di denaro',
      'giroconto',
    ],
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFromMerchantCategoryCode(value: string | null | undefined) {
  const numeric = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return mccRanges.find((range) => numeric >= range.from && numeric <= range.to)?.systemKey ?? null;
}

export function inferCategorySystemKey(input: CategoryInferenceInput) {
  const mccMatch = inferFromMerchantCategoryCode(input.merchantCategoryCode);
  if (mccMatch) {
    return mccMatch;
  }

  const text = normalizeText(
    [
      input.description,
      input.counterpartyName ?? '',
      input.bankTransactionCode ?? '',
      ...(input.remittanceInformation ?? []),
    ].join(' '),
  );

  for (const rule of keywordRules) {
    const isSharedCategory = rule.systemKey.startsWith('category:');
    if (input.direction === 'CRDT' && !isSharedCategory && !rule.systemKey.startsWith('income:')) {
      continue;
    }

    if (input.direction === 'DBIT' && !isSharedCategory && !rule.systemKey.startsWith('expense:')) {
      continue;
    }

    if (rule.tokens.some((token) => text.includes(normalizeText(token)))) {
      return rule.systemKey;
    }
  }

  return input.direction === 'CRDT' ? 'income:other' : 'expense:other';
}
