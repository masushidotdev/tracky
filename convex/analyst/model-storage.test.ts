// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import {
  ANALYST_MODEL_STORAGE_KEY,
  DEFAULT_ANALYST_MODEL,
  analystModelStorageKey,
  analystModels,
  loadStoredAnalystModel,
  readStoredAnalystModel,
  selectAnalystModel,
  selectableModels,
  storeAnalystModel,
} from '../../src/components/banking/analyst/helpers';
import { AnalystModelValue } from '../../src/components/banking/analyst/analyst-model-value';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('Analyst model persistence', () => {
  test('renders the selected model label directly in the trigger markup', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AnalystModelValue, {
        value: 'openai/gpt-5.6-terra',
      }),
    );

    expect(markup).toContain('data-slot="analyst-model-value"');
    expect(markup).toContain('GPT-5.6 Terra');
  });

  test('ignores empty and unsupported select events instead of corrupting the controlled model', () => {
    const changes: Array<string> = [];

    selectAnalystModel('', (model) => changes.push(model));
    selectAnalystModel('unsupported/model', (model) => changes.push(model));
    selectAnalystModel('openai/gpt-5.6-terra', (model) => changes.push(model));

    expect(changes).toEqual(['openai/gpt-5.6-terra']);
  });

  test('provides a visible label for every selectable model', () => {
    expect(analystModels.map((model) => model.id)).toEqual(selectableModels);
  });

  test('keeps selections isolated by thread while retaining the latest default for new threads', () => {
    const storage = memoryStorage();

    storeAnalystModel(storage, 'openai/gpt-5.6-terra', 'thread-a');
    storeAnalystModel(storage, 'anthropic/claude-fable-5', 'thread-b');

    expect(readStoredAnalystModel(storage, 'thread-a')).toBe('openai/gpt-5.6-terra');
    expect(readStoredAnalystModel(storage, 'thread-b')).toBe('anthropic/claude-fable-5');
    expect(readStoredAnalystModel(storage, 'thread-new')).toBe('anthropic/claude-fable-5');
    expect(storage.values.get(analystModelStorageKey('thread-a'))).toBe('openai/gpt-5.6-terra');
  });

  test('migrates the legacy global selection and rejects unsupported values', () => {
    const migrated = memoryStorage({ [ANALYST_MODEL_STORAGE_KEY]: 'openai/gpt-5.6-sol' });
    const invalid = memoryStorage({
      [ANALYST_MODEL_STORAGE_KEY]: 'unsupported/model',
      [analystModelStorageKey('thread-a')]: 'unsupported/model',
    });

    expect(loadStoredAnalystModel(migrated, 'thread-a')).toBe('openai/gpt-5.6-sol');
    storeAnalystModel(migrated, 'anthropic/claude-fable-5', 'thread-b');
    expect(readStoredAnalystModel(migrated, 'thread-a')).toBe('openai/gpt-5.6-sol');
    expect(readStoredAnalystModel(invalid, 'thread-a')).toBe(DEFAULT_ANALYST_MODEL);
  });

  test('falls back safely when browser storage is unavailable', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    };

    expect(readStoredAnalystModel(unavailable, 'thread-a')).toBe(DEFAULT_ANALYST_MODEL);
    expect(() => storeAnalystModel(unavailable, 'openai/gpt-5.6-terra', 'thread-a')).not.toThrow();
  });

  test('never persists an empty runtime model value', () => {
    const storage = memoryStorage({ [ANALYST_MODEL_STORAGE_KEY]: 'openai/gpt-5.6-terra' });

    storeAnalystModel(storage, '', 'thread-a');

    expect(storage.values.get(ANALYST_MODEL_STORAGE_KEY)).toBe('openai/gpt-5.6-terra');
    expect(storage.values.has(analystModelStorageKey('thread-a'))).toBe(false);
  });
});
