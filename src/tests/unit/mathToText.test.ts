import { describe, expect, it } from 'vitest';
import { convertibleMathWord } from '../../math/mathToText';
import { step } from '../step';

describe('math to text eligibility', () => {
  it('converts only unstructured words', () => {
    step('accepts natural-language words', () => {
      expect(convertibleMathWord('Maximum')).toBe('Maximum');
      expect(convertibleMathWord('Steel')).toBe('Steel');
    });
    step('keeps mathematical structures as math', () => {
      expect(convertibleMathWord('x')).toBeNull();
      expect(convertibleMathWord('x\\coloneq125')).toBeNull();
      expect(convertibleMathWord('\\frac{1}{2}')).toBeNull();
      expect(convertibleMathWord('\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}')).toBeNull();
    });
  });
});
