import { describe, expect, test } from 'vitest';
import { normalizeWizard, normalizeWorkspace } from './pageShellTypes';

describe('normalizeWorkspace', () => {
  test('returns undefined when empty', () => {
    expect(normalizeWorkspace(null)).toBeUndefined();
    expect(normalizeWorkspace({ enabled: true })).toBeUndefined();
  });

  test('normalizes three regions', () => {
    const ws = normalizeWorkspace({
      left: { span: 3, title: 'L', components: ['a'] },
      center: { components: ['b', 'c'] },
      right: { span: 4, components: ['d'] },
    });
    expect(ws?.left?.span).toBe(3);
    expect(ws?.center?.components).toEqual(['b', 'c']);
    expect(ws?.right?.span).toBe(4);
  });
});

describe('normalizeWizard', () => {
  test('requires steps', () => {
    expect(normalizeWizard({ enabled: true, steps: [] })).toBeUndefined();
  });

  test('normalizes step list', () => {
    const w = normalizeWizard({
      finishActionCode: 'act_finish',
      steps: [
        { code: 's1', title: '一', components: ['t1'] },
        { title: '二', components: ['t2'] },
      ],
    });
    expect(w?.steps).toHaveLength(2);
    expect(w?.steps[0].code).toBe('s1');
    expect(w?.steps[1].code).toBe('step_2');
    expect(w?.finishActionCode).toBe('act_finish');
  });
});
