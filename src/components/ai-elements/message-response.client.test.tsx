// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { MessageResponse } from './message';
import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const UNSAFE_SCHEMES = ['javascript:', 'vbscript:', 'data:'];

function isUnsafeUrl(href: string | null): boolean {
  return !!href && UNSAFE_SCHEMES.some((scheme) => href.trim().toLowerCase().startsWith(scheme));
}

let containers: Array<HTMLElement> = [];
let roots: Array<Root> = [];

function renderClient(markdown: string): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(MessageResponse, null, markdown));
  });
  containers.push(container);
  roots.push(root);
  return container;
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of containers) {
    container.remove();
  }
  containers = [];
  roots = [];
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('MessageResponse untrusted markdown (client-rendered)', () => {
  test.each([
    ['javascript: link', '[x](javascript:alert(1))'],
    ['javascript: link, mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['javascript: link, leading whitespace', '[x](   javascript:alert(1))'],
    ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
    ['vbscript: link', '[x](vbscript:msgbox(1))'],
    ['raw anchor with javascript: href', '<a href="javascript:alert(1)">click</a>'],
    ['raw anchor with data: href', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
  ])('renders no actionable control for %s', (_name, markdown) => {
    const container = renderClient(markdown);
    // Streamdown renders links behind its link-safety flow as buttons; an
    // unsafe URL must never reach that flow, nor a plain anchor href.
    expect(container.querySelector('button[data-streamdown="link"]')).toBeNull();
    for (const anchor of container.querySelectorAll('a[href]')) {
      expect(isUnsafeUrl(anchor.getAttribute('href'))).toBe(false);
    }
  });

  test.each([
    ['javascript: link', '[x](javascript:alert(1))'],
    ['javascript: link, mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['javascript: link, leading whitespace', '[x](   javascript:alert(1))'],
    ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
    ['vbscript: link', '[x](vbscript:msgbox(1))'],
    ['raw anchor with javascript: href', '<a href="javascript:alert(1)">click</a>'],
    ['raw anchor with data: href', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
    ['data: image source', '![x](data:text/html,<script>alert(1)</script>)'],
  ])('clicking rendered %s never opens the unsafe URL', (_name, markdown) => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const container = renderClient(markdown);
    act(() => {
      for (const el of container.querySelectorAll('a, button')) {
        (el as HTMLElement).click();
      }
    });
    for (const call of openSpy.mock.calls) {
      expect(isUnsafeUrl(typeof call[0] === 'string' ? call[0] : null)).toBe(false);
    }
  });

  test('safe https link still opens through the confirmation flow (harness control)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const container = renderClient('[x](https://example.com/)');
    const linkButton = container.querySelector('button[data-streamdown="link"]');
    expect(linkButton).not.toBeNull();
    act(() => {
      (linkButton as HTMLElement).click();
    });
    const modal = document.body.querySelector('[data-streamdown="link-safety-modal"]');
    expect(modal).not.toBeNull();
    const confirm = Array.from(modal!.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Open link'),
    );
    expect(confirm).toBeDefined();
    act(() => {
      confirm!.click();
    });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noreferrer');
  });
});
