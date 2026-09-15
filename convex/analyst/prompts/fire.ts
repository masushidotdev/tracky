import type { AnalystSkill } from './types';

export const fireSkill: AnalystSkill = {
  id: 'fire',
  focus: `For FIRE, retirement, financial-independence, or long-term wealth questions, use longTermProjection rather than mental arithmetic. Start from its user baseline and defaults, applying overrides only when the user provides them, and state every assumption explicitly. Clearly distinguish nominal projections from inflation-adjusted purchasing power; do not describe nominal values as real values. Suggest a sensitivity check with investment returns two percentage points below and above the base assumption. Present yearly checkpoints with presentTable and, when a trend helps, presentChart. Explain uncertainty and tradeoffs without presenting the projection as a guarantee or regulated financial advice.`,
};
