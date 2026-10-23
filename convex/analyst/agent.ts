import { Agent, isStepCount } from '@convex-dev/agent';
import { gateway } from 'ai';
import { components } from '../_generated/api';
import { buildInstructions, proactiveAnalystSkills } from './prompts';
import { analystProactiveTools, analystTools } from './tools';
import { DEFAULT_MODEL } from './models';
import type { LanguageModel, ToolSet } from 'ai';
import type { AgentComponent } from '@convex-dev/agent';
import type { SelectableModel } from './models';
import type { AnalystSkill } from './prompts';

const agentComponent: AgentComponent = components.agent;

export function makeAnalystAgent(
  modelId: SelectableModel,
  locale: string,
  skills?: ReadonlyArray<AnalystSkill>,
  memoryContext?: string,
  approvalContext?: string,
): Agent<object, ToolSet> {
  const languageModel: Exclude<LanguageModel, string> = gateway(modelId);
  const options = {
    name: 'analyst',
    languageModel,
    instructions: buildInstructions({ locale, skills, memoryContext, approvalContext }),
    tools: analystTools,
    stopWhen: isStepCount(12),
  };
  return new Agent<object, ToolSet>(agentComponent, options);
}

export function makeProactiveAnalystAgent(locale: string, skills?: ReadonlyArray<AnalystSkill>): Agent<object, ToolSet> {
  const options = {
    name: 'analyst-proactive',
    languageModel: gateway(DEFAULT_MODEL),
    instructions: buildInstructions({ locale, skills: skills ?? proactiveAnalystSkills }),
    tools: analystProactiveTools,
    stopWhen: isStepCount(12),
  };
  return new Agent<object, ToolSet>(agentComponent, options);
}
