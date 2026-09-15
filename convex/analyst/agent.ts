import { Agent, stepCountIs } from '@convex-dev/agent';
import { gateway } from 'ai';
import { components } from '../_generated/api';
import { buildInstructions, proactiveAnalystSkills } from './prompts';
import { analystProactiveTools, analystTools } from './tools';
import { DEFAULT_MODEL } from './models';
import type { SelectableModel } from './models';
import type { AnalystSkill } from './prompts';

export function makeAnalystAgent(
  modelId: SelectableModel,
  locale: string,
  skills?: ReadonlyArray<AnalystSkill>,
  memoryContext?: string,
  approvalContext?: string,
): Agent {
  return new Agent(components.agent, {
    name: 'analyst',
    languageModel: gateway(modelId),
    instructions: buildInstructions({ locale, skills, memoryContext, approvalContext }),
    tools: analystTools,
    stopWhen: stepCountIs(12),
  });
}

export function makeProactiveAnalystAgent(locale: string, skills?: ReadonlyArray<AnalystSkill>): Agent {
  return new Agent(components.agent, {
    name: 'analyst-proactive',
    languageModel: gateway(DEFAULT_MODEL),
    instructions: buildInstructions({ locale, skills: skills ?? proactiveAnalystSkills }),
    tools: analystProactiveTools,
    stopWhen: stepCountIs(12),
  });
}
