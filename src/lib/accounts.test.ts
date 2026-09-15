import { describe, expect, it } from 'vitest';

import { accountLabel } from './accounts';

describe('accountLabel', () => {
  it('names an aliased account with no institution by its alias', () => {
    // Converting a money box creates exactly this: a manual account carrying the
    // "[Pocket] …" alias and no institution. Interpolating the institution anyway
    // printed "undefined ([Pocket] Condominio)" as the Cash Flow group heading.
    expect(accountLabel({ alias: '[Pocket] Condominio', name: 'Condominio' })).toBe('[Pocket] Condominio');
  });

  it('keeps institution and alias together when the bank is known', () => {
    expect(accountLabel({ institutionName: 'Acme Bank', alias: 'Conto principale' })).toBe(
      'Acme Bank (Conto principale)',
    );
  });

  it('falls back through institution, iban and name', () => {
    expect(accountLabel({ institutionName: 'Acme Bank' })).toBe('Acme Bank');
    expect(accountLabel({ ibanMasked: 'IT••1234' })).toBe('IT••1234');
    expect(accountLabel({ name: 'Contanti' })).toBe('Contanti');
  });

  it('ignores blank values instead of printing them', () => {
    expect(accountLabel({ institutionName: '   ', alias: '[Pocket] Nicky Allowances' })).toBe(
      '[Pocket] Nicky Allowances',
    );
    expect(accountLabel(null)).toBe('-');
  });
});
