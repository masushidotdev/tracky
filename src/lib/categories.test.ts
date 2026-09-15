import { CircleIcon } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ICON_OPTIONS,
  categoryIconForName,
  loadCategoryIconNames,
  searchCategoryIconNames,
} from './categories';

describe('category icons', () => {
  it('keeps every curated icon in the installed Lucide catalog', async () => {
    const availableNames = new Set(await loadCategoryIconNames());
    const missingNames = CATEGORY_ICON_OPTIONS.map(({ name }) => name).filter((name) => !availableNames.has(name));

    expect(missingNames).toEqual([]);
  });

  it('ranks prefix matches before substring matches and respects the cap', () => {
    const iconNames = ['square-arrow-down', 'arrow-up', 'circle-arrow-down', 'arrow-down'] as const;

    expect(searchCategoryIconNames(iconNames, ' arrow ', 3)).toEqual({
      matches: ['arrow-up', 'arrow-down', 'square-arrow-down'],
      total: 4,
    });
  });

  it('returns curated components synchronously and falls back for unknown names', () => {
    const curated = CATEGORY_ICON_OPTIONS.find(({ name }) => name === 'home');

    expect(curated).toBeDefined();
    expect(categoryIconForName('home')).toBe(curated?.icon);
    expect(categoryIconForName('not-a-lucide-icon')).toBe(CircleIcon);
  });
});
