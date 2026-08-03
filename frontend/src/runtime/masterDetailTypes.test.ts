import { describe, expect, test } from 'vitest';
import { normalizeMasterDetail, nextTempId } from './masterDetailTypes';

describe('normalizeMasterDetail', () => {
  test('returns undefined when disabled or incomplete', () => {
    expect(normalizeMasterDetail(null)).toBeUndefined();
    expect(normalizeMasterDetail({ enabled: false })).toBeUndefined();
    expect(normalizeMasterDetail({ enabled: true, header: {} })).toBeUndefined();
  });

  test('normalizes header/lines fields', () => {
    const md = normalizeMasterDetail({
      enabled: true,
      draftStatus: 'draft',
      submitStatus: 'submitted',
      header: {
        entityCode: 'h',
        primaryKey: 'id',
        versionField: 'version',
        requiredMemberField: 'member_name',
        loadQueryCode: 'q_h',
        fields: ['order_no', { field: 'member_name', label: '会员', required: true }],
      },
      lines: {
        entityCode: 'l',
        fkField: 'order_id',
        loadQueryCode: 'q_l',
        fields: [{ field: 'qty', type: 'number' }],
      },
    });
    expect(md?.header.entityCode).toBe('h');
    expect(md?.header.fields).toHaveLength(2);
    const second = md?.header.fields?.[1];
    expect(typeof second === 'object' && second && 'label' in second ? second.label : undefined).toBe(
      '会员',
    );
    expect(md?.lines.fkField).toBe('order_id');
    expect(md?.submitStatus).toBe('submitted');
  });
});

describe('nextTempId', () => {
  test('returns unique-ish ids', () => {
    const a = nextTempId();
    const b = nextTempId();
    expect(a).not.toBe(b);
    expect(a.startsWith('tmp_')).toBe(true);
  });
});
