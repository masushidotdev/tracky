import * as React from 'react';

import { CategoryIcon, CategoryIconGlyph } from './category-icon';
import type { Doc } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CATEGORY_ICON_OPTIONS,
  categoryIconForeground,
  categoryKindDisplayName,
  loadCategoryIconNames,
  searchCategoryIconNames,
} from '@/lib/categories';
import { useI18n } from '@/lib/i18n';

export type CategoryEditorValues = {
  name: string;
  kind: Doc<'categories'>['kind'];
  applicableKinds: Array<Doc<'categories'>['kind']>;
  color: string;
  icon: string;
  budgetEligible: boolean;
};

const kinds = ['expense', 'income', 'transfer'] as const;
const suggestedIconNames = CATEGORY_ICON_OPTIONS.map(({ name }) => name);

function CategoryIconChoice({
  name,
  onSelect,
  selected,
}: {
  name: string;
  onSelect: (name: string) => void;
  selected: boolean;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'secondary' : 'ghost'}
      size="icon"
      aria-label={name}
      aria-pressed={selected}
      onClick={() => onSelect(name)}
    >
      <CategoryIconGlyph name={name} />
    </Button>
  );
}

function initialValues(category: Doc<'categories'> | null): CategoryEditorValues {
  return category
    ? {
        name: category.name,
        kind: category.kind,
        // This editor only handles custom categories, whose kind toggles are
        // 'expense' | 'income' | 'transfer' — drop any 'internal' entry a
        // system category (e.g. Loans) might carry, it isn't editable here.
        applicableKinds: (category.applicableKinds ?? [category.kind]).filter(
          (kind): kind is Doc<'categories'>['kind'] => kind !== 'internal',
        ),
        color: category.color ?? '#737373',
        icon: category.icon ?? 'circle',
        budgetEligible: category.budgetEligible,
      }
    : {
        name: '',
        kind: 'expense',
        applicableKinds: ['expense'],
        color: '#7c3aed',
        icon: 'circle',
        budgetEligible: true,
      };
}

export function CategoryEditorDialog({
  category,
  onOpenChange,
  onSave,
  open,
  saving,
}: {
  category: Doc<'categories'> | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: CategoryEditorValues) => Promise<void>;
  open: boolean;
  saving: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = React.useState(() => initialValues(category));
  const [iconQuery, setIconQuery] = React.useState('');
  const [availableIconNames, setAvailableIconNames] = React.useState<ReadonlyArray<string> | null>(null);
  const [iconCatalogFailed, setIconCatalogFailed] = React.useState(false);
  const invalidName = values.name.trim().length < 2;
  const validColor = /^#[0-9a-f]{6}$/i.test(values.color) ? values.color : '#737373';
  const searchingIcons = iconQuery.trim().length > 0;
  const iconSearchResults = React.useMemo(
    () => searchCategoryIconNames(availableIconNames ?? [], iconQuery),
    [availableIconNames, iconQuery],
  );
  const visibleIconNames = searchingIcons ? iconSearchResults.matches : suggestedIconNames;
  const selectedIconVisible = visibleIconNames.includes(values.icon);

  React.useEffect(() => {
    let active = true;
    void loadCategoryIconNames().then(
      (iconNames) => {
        if (active) setAvailableIconNames(iconNames);
      },
      () => {
        if (active) setIconCatalogFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const changePrimaryKind = (kind: Doc<'categories'>['kind']) => {
    setValues((current) => ({
      ...current,
      kind,
      applicableKinds: current.applicableKinds.includes(kind)
        ? current.applicableKinds
        : [...current.applicableKinds, kind],
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidName) return;
    await onSave({ ...values, name: values.name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(category ? 'settings.categories.editTitle' : 'settings.categories.createTitle')}</DialogTitle>
          <DialogDescription>{t('settings.categories.editorDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <FieldGroup>
              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
                <CategoryIcon category={values} className="size-12 [&_svg]:size-6" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{values.name.trim() || t('settings.categories.preview')}</p>
                  <p className="text-sm text-muted-foreground">{categoryKindDisplayName(values.kind, t)}</p>
                </div>
              </div>

              <Field data-invalid={invalidName}>
                <FieldLabel htmlFor="category-name">{t('settings.categories.name')}</FieldLabel>
                <Input
                  id="category-name"
                  value={values.name}
                  onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('settings.categories.namePlaceholder')}
                  aria-invalid={invalidName}
                  maxLength={60}
                  autoFocus
                />
                <FieldDescription>{t('settings.categories.nameHint')}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('settings.categories.primaryKind')}</FieldLabel>
                <Select value={values.kind} onValueChange={(value) => changePrimaryKind(value as typeof values.kind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {kinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {categoryKindDisplayName(kind, t)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t('settings.categories.primaryKindHint')}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('settings.categories.applicableKinds')}</FieldLabel>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  spacing={0}
                  value={values.applicableKinds}
                  onValueChange={(nextKinds) => {
                    const typedKinds = nextKinds as Array<Doc<'categories'>['kind']>;
                    if (!typedKinds.includes(values.kind)) return;
                    setValues((current) => ({ ...current, applicableKinds: typedKinds }));
                  }}
                  className="w-full"
                >
                  {kinds.map((kind) => (
                    <ToggleGroupItem key={kind} value={kind} className="flex-1">
                      {categoryKindDisplayName(kind, t)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>{t('settings.categories.applicableKindsHint')}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('settings.categories.icon')}</FieldLabel>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel htmlFor="category-icon-search">{t('settings.categories.iconSearch')}</FieldLabel>
                    <Input
                      id="category-icon-search"
                      type="search"
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder={t('settings.categories.iconSearchPlaceholder')}
                    />
                  </div>

                  {!selectedIconVisible ? (
                    <div className="space-y-2">
                      <FieldTitle role="heading" aria-level={3}>
                        {t('settings.categories.iconCurrent')}
                      </FieldTitle>
                      <CategoryIconChoice
                        name={values.icon}
                        selected
                        onSelect={(icon) => setValues((current) => ({ ...current, icon }))}
                      />
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-3">
                    <FieldTitle role="heading" aria-level={3}>
                      {t(searchingIcons ? 'settings.categories.iconResults' : 'settings.categories.iconSuggested')}
                    </FieldTitle>
                    {searchingIcons && availableIconNames ? (
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {t(
                          iconSearchResults.total === 1
                            ? 'settings.categories.iconMatches.one'
                            : 'settings.categories.iconMatches.other',
                          { count: iconSearchResults.total },
                        )}
                      </p>
                    ) : null}
                  </div>

                  {searchingIcons && availableIconNames === null && !iconCatalogFailed ? (
                    <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                  ) : searchingIcons && iconCatalogFailed ? (
                    <p className="text-sm text-muted-foreground">{t('settings.categories.iconLoadFailed')}</p>
                  ) : searchingIcons && iconSearchResults.total === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('settings.categories.iconNoMatches')}</p>
                  ) : (
                    <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
                      {visibleIconNames.map((name) => (
                        <CategoryIconChoice
                          key={name}
                          name={name}
                          selected={values.icon === name}
                          onSelect={(icon) => setValues((current) => ({ ...current, icon }))}
                        />
                      ))}
                    </div>
                  )}

                  {searchingIcons && iconSearchResults.total > iconSearchResults.matches.length ? (
                    <p className="text-xs text-muted-foreground">
                      {t('settings.categories.iconResultsLimited', {
                        shown: iconSearchResults.matches.length,
                        count: iconSearchResults.total,
                      })}
                    </p>
                  ) : null}
                </div>
                <FieldDescription>{t('settings.categories.iconHint')}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="category-color">{t('settings.categories.color')}</FieldLabel>
                <div className="flex items-center gap-3">
                  <Input
                    id="category-color"
                    type="color"
                    value={validColor}
                    onChange={(event) => setValues((current) => ({ ...current, color: event.target.value }))}
                    className="size-12 cursor-pointer p-1"
                    aria-label={t('settings.categories.color')}
                  />
                  <Input
                    value={values.color}
                    onChange={(event) => setValues((current) => ({ ...current, color: event.target.value }))}
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                    className="max-w-32 font-mono uppercase"
                    aria-label={t('settings.categories.colorHex')}
                  />
                  <span
                    className="flex size-9 items-center justify-center rounded-full text-xs font-medium"
                    style={{ backgroundColor: validColor, color: categoryIconForeground(validColor) }}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                </div>
                <FieldDescription>{t('settings.categories.colorHint')}</FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <div className="flex-1">
                  <FieldTitle>{t('settings.categories.budgetEligible')}</FieldTitle>
                  <FieldDescription>{t('settings.categories.budgetEligibleHint')}</FieldDescription>
                </div>
                <Switch
                  checked={values.budgetEligible}
                  onCheckedChange={(budgetEligible) => setValues((current) => ({ ...current, budgetEligible }))}
                  aria-label={t('settings.categories.budgetEligible')}
                />
              </Field>
            </FieldGroup>
          </ScrollArea>
          <DialogFooter className="mt-6 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || invalidName || !/^#[0-9a-f]{6}$/i.test(values.color)}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {t(category ? 'settings.categories.saveChanges' : 'settings.categories.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
