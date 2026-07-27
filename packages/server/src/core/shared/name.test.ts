import { describe, it, expect } from 'vitest';
import { splitName } from './name.js';

describe('splitName', () => {
  it('splits on the first space', () => {
    expect(splitName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' });
  });

  it('keeps a compound surname intact', () => {
    expect(splitName('Ada van der Berg')).toEqual({ first: 'Ada', last: 'van der Berg' });
  });

  it('leaves last empty for a single word', () => {
    expect(splitName('Ada')).toEqual({ first: 'Ada', last: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(splitName('  Ada Lovelace  ')).toEqual({ first: 'Ada', last: 'Lovelace' });
  });

  it('handles an empty name', () => {
    expect(splitName('')).toEqual({ first: '', last: '' });
  });
});
