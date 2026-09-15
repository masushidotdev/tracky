import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import type { Tool } from 'ai';

const cellValue = z.union([z.string(), z.number()]);
const dataKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'Invalid data key');
const currency = z.string().regex(/^[A-Z]{3}$/, 'Invalid currency');

export const presentChart: Tool = createTool({
  description: 'Present validated chart data for client-side rendering.',
  inputSchema: z.object({
    title: z.string(),
    type: z.enum(['bar', 'line', 'area', 'pie']),
    xKey: dataKey,
    series: z
      .array(z.object({ key: dataKey, label: z.string() }))
      .min(1)
      .max(5),
    data: z.array(z.record(dataKey, cellValue)).max(60),
    currency: currency.optional(),
  }),
  execute: (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return Promise.resolve(input);
  },
});

export const presentTable: Tool = createTool({
  description: 'Present validated tabular data for client-side rendering.',
  inputSchema: z.object({
    title: z.string(),
    columns: z.array(
      z.object({
        key: dataKey,
        label: z.string(),
        align: z.enum(['left', 'center', 'right']).optional(),
        format: z.enum(['money', 'date', 'text']).optional(),
      }),
    ),
    rows: z.array(z.record(dataKey, cellValue)).max(50),
    currency: currency.optional(),
  }),
  execute: (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return Promise.resolve(input);
  },
});
