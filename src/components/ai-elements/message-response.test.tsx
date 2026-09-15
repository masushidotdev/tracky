// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { MessageResponse } from './message';

function render(markdown: string) {
  return renderToStaticMarkup(React.createElement(MessageResponse, null, markdown));
}

describe('MessageResponse untrusted markdown', () => {
  test.each([
    ['javascript: link', '[x](javascript:alert(1))'],
    ['javascript: link, mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['javascript: link, leading whitespace', '[x](   javascript:alert(1))'],
    ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
    ['vbscript: link', '[x](vbscript:msgbox(1))'],
    ['raw anchor with javascript: href', '<a href="javascript:alert(1)">click</a>'],
    ['raw anchor with data: href', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
  ])('neutralizes %s', (_name, markdown) => {
    const markup = render(markdown).toLowerCase();
    expect(markup).not.toContain('javascript:');
    expect(markup).not.toContain('vbscript:');
    expect(markup).not.toContain('data:text/html');
    expect(markup).not.toMatch(/<a[^>]*href/);
  });

  test.each([
    ['script element', '<script>alert(1)</script>'],
    ['raw img with onerror', '<img src="x" onerror="alert(1)">'],
    ['svg with onload', '<svg onload="alert(1)">'],
    ['iframe element', '<iframe src="https://evil.example/"></iframe>'],
  ])('strips %s without executable markup', (_name, markdown) => {
    const markup = render(markdown).toLowerCase();
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<iframe');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('onerror');
    expect(markup).not.toContain('onload');
  });

  test('blocks data: image sources', () => {
    const markup = render('![x](data:text/html,<script>alert(1)</script>)').toLowerCase();
    expect(markup).not.toContain('data:text/html');
    expect(markup).not.toMatch(/<img[^>]*src/);
  });

  test('keeps benign https links and images rendering', () => {
    // Safe links render as a confirmation button (href opened via window.open
    // after the link-safety check), so the URL is not in the static markup.
    const link = render('[x](https://example.com/)');
    expect(link).toContain('>x</button>');
    expect(link).not.toContain('[blocked]');
    const image = render('![x](https://example.com/a.png)');
    expect(image).toContain('https://example.com/a.png');
  });
});
