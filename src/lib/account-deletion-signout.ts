import { createServerFn } from '@tanstack/react-start';
import { deleteCookie } from '@tanstack/react-start/server';

// WorkOS has already deleted the user when the erasure job finishes. Its
// session logout endpoint may no longer complete, so clear this app's cookie
// and let the browser load the public homepage directly.
export const clearDeletedAccountSession = createServerFn({ method: 'POST' }).handler(() => {
  deleteCookie(process.env.WORKOS_COOKIE_NAME || 'wos-session', {
    path: '/',
    domain: process.env.WORKOS_COOKIE_DOMAIN || undefined,
  });
});
