import { ChevronRightIcon, Link2Icon } from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';

import { api } from '../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { TranslationKey } from '@/lib/i18n';
import { Amount } from '@/components/app/amount';
import { ListSkeleton } from '@/components/app/skeletons';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { useSidebarGroupState } from '@/hooks/use-sidebar-group-state';
import { useI18n } from '@/lib/i18n';

type SidebarAccountGroup = FunctionReturnType<typeof api.banking.accounts.listSidebarAccounts>['groups'][number];

const groupLabelKeys: Record<SidebarAccountGroup['group'], TranslationKey> = {
  cash: 'nav.accountGroup.cash',
  credit: 'nav.accountGroup.credit',
  loan: 'nav.accountGroup.loans',
};

function AccountGroup({ group }: { group: SidebarAccountGroup }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const state = useSidebarGroupState(`accounts.${group.group}`);

  if (group.rows.length === 0) return null;

  return (
    <Collapsible open={state.open} onOpenChange={state.onOpenChange} asChild>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          {/* pr-9 matches the rows' right inset (sub list mx-3.5 + px-2.5, button px-3) so the group
              total and the account balances line up on one right edge. */}
          <SidebarGroupLabel className="cursor-pointer pr-14 uppercase [&[data-state=open]>svg]:rotate-90">
            <ChevronRightIcon className="transition-transform" />
            <span>{t(groupLabelKeys[group.group])}</span>
            {group.total ? (
              <Amount money={group.total} variant="balance" className="ml-auto text-right text-xs font-medium" />
            ) : null}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.rows.map((row) => {
              const href = row.kind === 'loan' ? `/app/loans/${row.id}` : `/app/accounts/${row.id}`;
              return (
                // The connection mark sits outside the button so it never moves with the row's
                // hover state, and its lane is always reserved so the balances stay in one column.
                <SidebarMenuSubItem key={row.id} className="flex items-center gap-1">
                  <SidebarMenuSubButton className="min-w-0 flex-1" isActive={pathname === href} asChild>
                    {row.kind === 'loan' ? (
                      <Link to="/app/loans/$facilityId" params={{ facilityId: row.id }}>
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        <Amount money={row.balance} variant="balance" className="ml-auto shrink-0 text-right text-xs" />
                      </Link>
                    ) : (
                      <Link to="/app/accounts/$accountId" params={{ accountId: row.id }}>
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        <Amount money={row.balance} variant="balance" className="ml-auto shrink-0 text-right text-xs" />
                      </Link>
                    )}
                  </SidebarMenuSubButton>
                  <span className="flex w-4 shrink-0 justify-center">
                    {row.kind === 'account' && row.linked ? (
                      <Link2Icon
                        className="size-3.5 text-muted-foreground"
                        aria-label={t('accounts.linkedToBank')}
                        role="img"
                      />
                    ) : null}
                  </span>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function AccountGroups() {
  const data = useAuthedQuery(api.banking.accounts.listSidebarAccounts, {});

  if (data === undefined) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <ListSkeleton rows={3} />
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return data.groups.map((group) => <AccountGroup key={group.group} group={group} />);
}

export function NavAccounts() {
  // A failure here must never take the whole app shell down with it.
  return (
    <PanelErrorBoundary>
      <AccountGroups />
    </PanelErrorBoundary>
  );
}
