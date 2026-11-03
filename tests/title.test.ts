import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE, hasTokens, renderTitle } from '@/lib/title';

const parts = (item: string[], section: string | null, account: string | null) => ({
  item,
  section,
  account,
});

describe('renderTitle', () => {
  it('renders item, section and account', () => {
    expect(renderTitle(DEFAULT_TEMPLATE, parts(['John Doe'], 'Contacts', 'Acme Training'))).toBe(
      'John Doe | Contacts | Acme Training',
    );
  });

  it('drops an empty item with its separator', () => {
    expect(renderTitle(DEFAULT_TEMPLATE, parts([], 'Contacts', 'Acme Training'))).toBe(
      'Contacts | Acme Training',
    );
  });

  it('drops an empty part in the middle', () => {
    expect(renderTitle(DEFAULT_TEMPLATE, parts(['John Doe'], null, 'Acme Training'))).toBe(
      'John Doe | Acme Training',
    );
  });

  it('joins a multi-part item with the template separator', () => {
    expect(
      renderTitle(DEFAULT_TEMPLATE, parts(['Step 2', 'Webinar Funnel'], 'Funnels', 'Acme Training')),
    ).toBe('Step 2 | Webinar Funnel | Funnels | Acme Training');
    expect(
      renderTitle('{item} · {section} · {account}', parts(['Step 2', 'Webinar'], 'Funnels', 'AT')),
    ).toBe('Step 2 · Webinar · Funnels · AT');
  });

  it('supports custom orders and separators', () => {
    expect(renderTitle('{account} — {section}: {item}', parts([], 'Contacts', 'Acme Training'))).toBe(
      'Acme Training — Contacts',
    );
    expect(
      renderTitle('[{account}] {item} / {section}', parts(['John Doe'], 'Contacts', 'Acme Training')),
    ).toBe('[Acme Training] John Doe / Contacts');
  });

  it('returns null when every part is empty', () => {
    expect(renderTitle(DEFAULT_TEMPLATE, parts([], null, null))).toBeNull();
  });

  it('falls back to the default template when the template has no tokens', () => {
    expect(hasTokens('just text')).toBe(false);
    expect(renderTitle('just text', parts([], 'Contacts', 'Acme Training'))).toBe(
      'Contacts | Acme Training',
    );
  });

  it('collapses whitespace in names', () => {
    expect(renderTitle(DEFAULT_TEMPLATE, parts(['  John   Doe '], ' Contacts', 'Acme Training'))).toBe(
      'John Doe | Contacts | Acme Training',
    );
  });
});
