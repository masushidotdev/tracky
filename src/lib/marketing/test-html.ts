/**
 * Extracts normalized visible text from an HTML snippet using the DOM HTML
 * parser (expects a DOM environment such as `// @vitest-environment jsdom`).
 */
export function extractVisibleText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}
