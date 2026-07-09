// test/yt.test.ts — npm test
import { describe, it, expect } from 'vitest';
import { ytId } from '../src/services/yt';

describe('ytId', () => {
  it('watch?v=', () => expect(ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('youtu.be', () => expect(ytId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('parâmetros extras', () => expect(ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1')).toBe('dQw4w9WgXcQ'));
  it('não-YouTube -> null', () => expect(ytId('https://vimeo.com/12345678')).toBeNull());
  it('vazia -> null', () => expect(ytId('')).toBeNull());
  it('null -> null', () => expect(ytId(null)).toBeNull());
});
