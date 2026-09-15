import type { Doc } from '../_generated/dataModel';

type RuleMatchInput = {
  description: string;
  counterpartyName?: string | null;
};

function normalizedRuleText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function valueForRule(rule: Doc<'categoryRules'>, input: RuleMatchInput) {
  return normalizedRuleText(rule.matchField === 'merchant' ? (input.counterpartyName ?? '') : input.description);
}

export function categoryRuleMatches(rule: Doc<'categoryRules'>, input: RuleMatchInput) {
  if (!rule.enabled) {
    return false;
  }

  const value = valueForRule(rule, input);
  const pattern = normalizedRuleText(rule.pattern);
  if (!value || !pattern) {
    return false;
  }

  if (rule.matchType === 'equals') {
    return value === pattern;
  }

  if (rule.matchType === 'prefix') {
    return value.startsWith(pattern);
  }

  return value.includes(pattern);
}

export function mergeCategoryRuleTagIds(
  existingTagIds: Doc<'transactions'>['tagIds'],
  addTagIds: Doc<'categoryRules'>['addTagIds'],
) {
  return [...new Set([...(existingTagIds ?? []), ...(addTagIds ?? [])])].slice(0, 10);
}

export function findFirstMatchingCategoryRule(rules: Array<Doc<'categoryRules'>>, input: RuleMatchInput) {
  const rule = rules.find((candidate) => categoryRuleMatches(candidate, input));
  if (!rule) {
    return null;
  }

  return {
    categoryId: rule.categoryId,
    addTagIds: rule.addTagIds,
    hideFromReports: rule.hideFromReports,
    transactionPatch: {
      ...(rule.addTagIds !== undefined ? { tagIds: mergeCategoryRuleTagIds(undefined, rule.addTagIds) } : {}),
      ...(rule.hideFromReports !== undefined ? { hiddenFromReports: rule.hideFromReports } : {}),
    },
  };
}
