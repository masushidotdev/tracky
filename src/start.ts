import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';
import { authkitMiddleware } from '@workos/authkit-tanstack-react-start';
import { applySecurityHeaders } from './lib/security-response';

const securityMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  applySecurityHeaders(result.response);
  return result;
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [securityMiddleware, authkitMiddleware(), csrfMiddleware],
  };
});
