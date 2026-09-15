// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { analystProactiveTools } from '../tools';
import { buildInstructions, proactiveAnalystSkills } from '../prompts';

describe('proactive analyst boundary', () => {
  test('contains only read, simulation, and presentation tools', () => {
    const toolNames = Object.keys(analystProactiveTools);
    expect(toolNames).toContain('compareDebtPayoff');
    expect(toolNames).toContain('getPlanWithProgress');
    expect(toolNames).toContain('presentTable');
    expect(toolNames).not.toContain('setPlanAssigned');
    expect(toolNames).not.toContain('setPlanTarget');
    expect(toolNames).not.toContain('createMoneyBox');
    expect(toolNames).not.toContain('createPlannedExpense');
    expect(toolNames).not.toContain('webSearch');
  });

  test('instructs autonomous reports to stay currency-scoped and read-only', () => {
    const instructions = buildInstructions({ locale: 'it-IT', skills: proactiveAnalystSkills });
    expect(instructions).toContain('Never combine currencies');
    expect(instructions).toContain('Never request or perform a write');
    expect(instructions).toContain("user's locale is it-IT");
  });

  test('persists report output through one mutation-owned pending delivery slot', () => {
    const reports = readFileSync(join(process.cwd(), 'convex/analyst/proactive/reports.ts'), 'utf8');
    const mutations = readFileSync(join(process.cwd(), 'convex/analyst/proactive/mutations.ts'), 'utf8');
    expect(reports).toContain("storageOptions: { saveMessages: 'none' }");
    expect(reports).toContain('refs.prepareDelivery');
    expect(reports).not.toContain('createThread(ctx');
    expect(mutations).toContain('export const prepareReportDelivery = internalMutation');
    expect(mutations).toContain('metadata.userId === args.userId');
    expect(mutations).toContain('report.threadId === preferredThreadId');
    expect(mutations).toContain("metadata: { status: 'pending' }");
    expect(mutations).toContain('pendingMessageId: report.outputMessageId');
    expect(mutations).toContain("if (report.status === 'completed') return report._id");
  });
});
