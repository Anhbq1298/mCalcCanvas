/**
 * Character map (Insert tab): special characters for text and equations.
 * Goes into the text region or equation being edited; with nothing open it
 * starts a new text region at the insertion point holding the character.
 */
import { createTextRegion, insertionPoint } from '../../canvas/canvasActions';
import { formatEditingText } from '../../canvas/textFormatting';
import { insertIntoActiveMath } from '../../math/activeEditor';
import { Popover } from './Popover';

/** [character, name, LaTeX for equations (when the plain character is not understood)]. */
type Char = [string, string, string?];

const CHARACTER_SETS: { title: string; chars: Char[] }[] = [
  {
    title: 'Greek',
    chars: [
      ['α', 'alpha', '\\alpha'], ['β', 'beta', '\\beta'], ['γ', 'gamma', '\\gamma'], ['δ', 'delta', '\\delta'], ['ε', 'epsilon', '\\varepsilon'],
      ['ζ', 'zeta', '\\zeta'], ['η', 'eta', '\\eta'], ['θ', 'theta', '\\theta'], ['κ', 'kappa', '\\kappa'], ['λ', 'lambda', '\\lambda'],
      ['μ', 'mu', '\\mu'], ['ν', 'nu', '\\nu'], ['ξ', 'xi', '\\xi'], ['π', 'pi', '\\pi'], ['ρ', 'rho', '\\rho'],
      ['σ', 'sigma', '\\sigma'], ['τ', 'tau', '\\tau'], ['φ', 'phi', '\\phi'], ['χ', 'chi', '\\chi'], ['ψ', 'psi', '\\psi'],
      ['ω', 'omega', '\\omega'], ['Γ', 'Gamma', '\\Gamma'], ['Δ', 'Delta', '\\Delta'], ['Θ', 'Theta', '\\Theta'], ['Λ', 'Lambda', '\\Lambda'],
      ['Σ', 'Sigma', '\\Sigma'], ['Φ', 'Phi', '\\Phi'], ['Ψ', 'Psi', '\\Psi'], ['Ω', 'Omega', '\\Omega'],
    ],
  },
  {
    title: 'Math',
    chars: [
      ['±', 'plus-minus', '\\pm'], ['×', 'times', '\\times'], ['÷', 'divide', '\\div'], ['·', 'middle dot', '\\cdot'], ['√', 'square root'],
      ['∞', 'infinity', '\\infty'], ['≈', 'approximately', '\\approx'], ['≠', 'not equal', '\\ne'], ['≤', 'less or equal', '\\le'], ['≥', 'greater or equal', '\\ge'],
      ['∑', 'sum'], ['∫', 'integral'], ['∂', 'partial', '\\partial'], ['∇', 'nabla', '\\nabla'], ['∠', 'angle', '\\angle'],
      ['⊥', 'perpendicular', '\\perp'], ['∥', 'parallel', '\\parallel'], ['∈', 'element of', '\\in'], ['∅', 'empty set', '\\emptyset'], ['∴', 'therefore', '\\therefore'],
    ],
  },
  {
    title: 'Units & engineering',
    chars: [
      ['°', 'degree', '\\degree'], ['′', 'prime (minutes, feet)', "'"], ['″', 'double prime (seconds, inches)', "''"], ['‰', 'per mille'], ['%', 'percent', '\\%'],
      ['µ', 'micro'], ['Ω', 'ohm', '\\Omega'], ['Ø', 'diameter (bar)'], ['⌀', 'diameter sign'], ['²', 'superscript two', '^2'],
      ['³', 'superscript three', '^3'], ['⁴', 'superscript four', '^4'], ['½', 'one half'], ['¼', 'one quarter'], ['¾', 'three quarters'],
    ],
  },
  {
    title: 'Arrows & marks',
    chars: [
      ['→', 'right arrow', '\\rightarrow'], ['←', 'left arrow', '\\leftarrow'], ['↑', 'up arrow', '\\uparrow'], ['↓', 'down arrow', '\\downarrow'], ['↔', 'left-right arrow', '\\leftrightarrow'],
      ['⇒', 'implies', '\\Rightarrow'], ['⇔', 'if and only if', '\\Leftrightarrow'], ['✓', 'check mark'], ['✗', 'cross mark'], ['•', 'bullet'],
      ['§', 'section'], ['¶', 'paragraph'], ['©', 'copyright'], ['…', 'ellipsis', '\\ldots'], ['–', 'en dash'],
    ],
  },
];

function insertCharacter([ch, , latex]: Char): void {
  if (formatEditingText('insertText', ch)) return;
  if (insertIntoActiveMath(latex ?? ch)) return;
  createTextRegion(insertionPoint(), ch);
}

export function CharacterMap() {
  return (
    <Popover title="Character map: insert a special character" testId="insert-charmap" big="Character Map" width={372} trigger={<span className="font-math text-[22px] leading-none text-docs-ink">Ω</span>}>
      {(close) => (
        <>
          {CHARACTER_SETS.map((set) => (
            <div key={set.title} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-docs-muted">{set.title}</div>
              <div className="grid grid-cols-10 gap-0.5">
                {set.chars.map((c) => (
                  <button
                    key={c[1]}
                    type="button"
                    title={`${c[0]}  ${c[1]}`}
                    aria-label={c[1]}
                    data-testid={`char-${c[1].replace(/\W+/g, '-')}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertCharacter(c);
                      close();
                    }}
                    className="flex h-8 cursor-pointer items-center justify-center rounded text-[16px] text-docs-ink transition-colors duration-150 hover:bg-docs-hover"
                  >
                    {c[0]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-1 border-t border-docs-border px-1 pt-1.5 text-[11px] leading-snug text-docs-muted">Goes into the text or equation you are editing, or starts a new text region.</p>
        </>
      )}
    </Popover>
  );
}
