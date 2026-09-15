import { describe, expect, it } from 'vitest';

import { createCsv } from './report-utils';

describe('createCsv', () => {
  it('neutralizes spreadsheet formula injection in attacker-controlled cells', () => {
    // Labels in report exports come from bank-controlled payee/category names.
    const csv = createCsv(
      [
        ['=HYPERLINK("https://evil.example","click")', 'safe'],
        ['+cmd|/c calc', '@SUM(1+1)'],
        ['-2+3', '\tindented'],
      ],
      ',',
    );
    const rows = csv.split('\n');
    expect(rows[0]).toBe(`"'=HYPERLINK(""https://evil.example"",""click"")",safe`);
    expect(rows[1]).toBe(`'+cmd|/c calc,'@SUM(1+1)`);
    expect(rows[2]).toBe(`'-2+3,'\tindented`);
  });

  it('leaves ordinary cells untouched', () => {
    expect(createCsv([['Netflix', '12,50']], ';')).toBe('Netflix;12,50');
    expect(createCsv([['plain']], ',')).toBe('plain');
  });

  it('still quotes cells containing the separator or quotes', () => {
    expect(createCsv([['a,b', 'c"d']], ',')).toBe('"a,b","c""d"');
  });
});
