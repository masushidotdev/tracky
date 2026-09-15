import * as React from 'react';

const STORAGE_KEY = 'tracky.sidebar.groups';

function readGroupState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function useSidebarGroupState(groupId: string) {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const storedOpen = readGroupState()[groupId];
    if (typeof storedOpen === 'boolean') setOpen(storedOpen);
  }, [groupId]);

  const onOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (typeof window === 'undefined') return;

      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...readGroupState(),
            [groupId]: nextOpen,
          }),
        );
      } catch {
        // The current session still works when storage is unavailable.
      }
    },
    [groupId],
  );

  return { open, onOpenChange };
}
