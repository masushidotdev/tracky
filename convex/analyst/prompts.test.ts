// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { budgetingSkill } from './prompts/budgeting';
import { analystSkills, buildInstructions, proactiveAnalystSkills } from './prompts';
import { fireSkill } from './prompts/fire';
import { purchaseSkill } from './prompts/purchase';

describe('buildInstructions', () => {
  test('contains the persona, HITL rule, and locale', () => {
    const instructions = buildInstructions({ locale: 'it-IT' });
    expect(instructions).toContain('Tracky Analyst');
    expect(instructions).toContain('needsApproval');
    expect(instructions).toContain('explicit approval');
    expect(instructions).toContain('a denied tool call was not executed');
    expect(instructions).toContain('never claim that every requested change succeeded');
    expect(instructions).toContain("user's locale is it-IT");
  });

  test('composes only the requested optional skills after core', () => {
    const instructions = buildInstructions({ locale: 'en-US', skills: [budgetingSkill] });
    expect(instructions).toContain(budgetingSkill.focus);
    expect(instructions).not.toContain('installment plans, statement cycles');
  });

  test('purchase skill requires complete inputs, simulation, currency safety, and alternatives', () => {
    const instructions = buildInstructions({ locale: 'en-US', skills: [purchaseSkill] });
    expect(instructions).toContain('exact amount, ISO currency, and intended purchase date');
    expect(instructions).toContain('simulateWhatIf');
    expect(instructions).toContain('Never invent or perform foreign-exchange conversion');
    expect(instructions).toContain('alternatives');
  });

  test('registers FIRE coaching for interactive analysis only', () => {
    expect(analystSkills).toContain(fireSkill);
    expect(proactiveAnalystSkills).not.toContain(fireSkill);
    const instructions = buildInstructions({ locale: 'en-US', skills: [fireSkill] });
    expect(instructions).toContain('longTermProjection');
    expect(instructions).toContain('every assumption explicitly');
    expect(instructions).toContain('inflation-adjusted purchasing power');
    expect(instructions).toContain('two percentage points below and above');
    expect(instructions).toContain('presentTable');
    expect(instructions).toContain('presentChart');
  });
});
