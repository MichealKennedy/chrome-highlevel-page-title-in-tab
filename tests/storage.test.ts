import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { agencyNamesItem, rememberName, smartListNamesItem } from '@/lib/storage';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('rememberName', () => {
  it('keeps names that another tab stored in the meantime', async () => {
    await rememberName({ kind: 'smartList', key: 'L/1', name: 'Hot Leads' });
    // Another tab learns a different list.
    await smartListNamesItem.setValue({
      ...(await smartListNamesItem.getValue()),
      'L/2': 'Cold Leads',
    });
    await rememberName({ kind: 'smartList', key: 'L/3', name: 'All Fields' });
    expect(await smartListNamesItem.getValue()).toEqual({
      'L/1': 'Hot Leads',
      'L/2': 'Cold Leads',
      'L/3': 'All Fields',
    });
  });

  it('drops the oldest names past the limit, counting a re-learned name as new', async () => {
    for (let i = 0; i < 50; i++) {
      await rememberName({ kind: 'agency', key: `host${i}`, name: `Agency ${i}` });
    }
    // host0 is re-learned, so host1 becomes the oldest.
    await rememberName({ kind: 'agency', key: 'host0', name: 'Agency 0 renamed' });
    await rememberName({ kind: 'agency', key: 'host50', name: 'Agency 50' });
    const stored = await agencyNamesItem.getValue();
    expect(Object.keys(stored)).toHaveLength(50);
    expect(stored.host1).toBeUndefined();
    expect(stored.host0).toBe('Agency 0 renamed');
    expect(stored.host50).toBe('Agency 50');
  });
});
