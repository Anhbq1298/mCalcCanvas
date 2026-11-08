/** Palette contents for the ribbon dropdowns. `latex` uses MathLive templates (#? placeholder, #@ selection). */
export interface PaletteItem {
  label: string;
  latex: string;
  title: string;
  /** Render the label with the math (serif italic) face. */
  math?: boolean;
  /** Shown for completeness but not usable yet. */
  disabled?: boolean;
}

export interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

/** Shown on operators the calculation engine cannot evaluate yet. */
const SOON = 'Not supported by the calculation engine yet';
const soon = (label: string, title: string, math = false): PaletteItem => ({ label, latex: '', title: `${title} – ${SOON}`, math, disabled: true });

/** Laid out like Mathcad Prime's Operators gallery. */
export const OPERATORS: PaletteSection[] = [
  {
    title: 'Algebra',
    items: [
      { label: '+', latex: '+', title: 'Add  ( + )' },
      { label: '−', latex: '-', title: 'Subtract  ( - )' },
      { label: '·', latex: '\\cdot ', title: 'Multiply  ( * )' },
      { label: '÷', latex: '\\div ', title: 'Divide inline' },
      { label: 'a/b', latex: '\\frac{#@}{#?}', title: 'Divide  ( / )', math: true },
      { label: 'xʸ', latex: '#@^{#?}', title: 'Power  ( ^ )', math: true },
      { label: '√x', latex: '\\sqrt{#?}', title: 'Square root  ( \\ )', math: true },
      { label: 'ⁿ√x', latex: '\\sqrt[#?]{#?}', title: 'Nth root  ( Ctrl+\\ )', math: true },
      { label: '|x|', latex: '\\left|#?\\right|', title: 'Absolute value  ( | )', math: true },
      soon('x!', 'Factorial', true),
      { label: '%', latex: '\\%', title: 'Percent (= 0.01)' },
      { label: '( )', latex: '\\left(#@\\right)', title: "Parentheses  ( ' )" },
      { label: ',', latex: ',', title: 'Argument separator (min, max)' },
      { label: 'xₐ', latex: '_{#?}', title: 'Literal subscript  ( . after a name )', math: true },
    ],
  },
  {
    title: 'Equation break',
    items: [soon('+↲', 'Break after addition'), soon('−↲', 'Break after subtraction'), soon('·↲', 'Break after multiplication'), soon('÷↲', 'Break after division')],
  },
  {
    title: 'Calculus',
    items: [
      soon('⊛', 'Convolution'),
      soon('∗', 'Discrete convolution'),
      soon('d/dx', 'Derivative', true),
      soon('∇', 'Gradient'),
      soon('∫dx', 'Definite integral', true),
      soon('lim', 'Limit'),
      soon('∂/∂x', 'Partial derivative', true),
      soon("x′", 'Prime derivative', true),
      soon('∏', 'Product'),
      soon('∑', 'Summation'),
    ],
  },
  {
    title: 'Comparison',
    items: [
      soon('∈', 'Element of'),
      { label: '=', latex: '\\equiv ', title: 'Equal to – comparison check  ( Ctrl+= )' },
      soon('⊕', 'Exclusive or'),
      { label: '>', latex: '>', title: 'Greater than' },
      { label: '≥', latex: '\\ge ', title: 'Greater than or equal  ( Ctrl+0 )' },
      { label: '<', latex: '<', title: 'Less than' },
      { label: '≤', latex: '\\le ', title: 'Less than or equal  ( Ctrl+9 )' },
      soon('∧', 'And'),
      soon('¬', 'Not'),
      soon('∨', 'Or'),
      { label: '≠', latex: '\\ne ', title: 'Not equal  ( Ctrl+3 )' },
    ],
  },
  {
    title: 'Definition and evaluation',
    items: [
      { label: '≔', latex: '\\coloneq ', title: 'Definition  ( : )' },
      { label: '=', latex: '=', title: 'Evaluate  ( = )' },
      soon('≡', 'Global definition'),
      soon('→', 'Symbolic evaluation'),
    ],
  },
  {
    title: 'Engineering',
    items: [
      soon('z̄', 'Complex conjugate', true),
      { label: '°', latex: '\\degree ', title: 'Degree (angle)' },
      soon('∠', 'Phasor angle'),
      soon('∘', 'Composition'),
    ],
  },
  {
    title: 'Vector and matrix',
    items: [
      soon('×', 'Cross product'),
      soon('‖x‖', 'Vector norm', true),
      soon('[▫]', 'Insert matrix'),
      soon('M⟨i⟩', 'Matrix column', true),
      soon('Mᵢ', 'Index', true),
      soon('Mᵀ', 'Transpose', true),
      soon('|M|', 'Determinant', true),
      soon('1..n', 'Range'),
      soon('1,3..n', 'Stepped range'),
      soon('V⃗', 'Vectorize', true),
    ],
  },
  {
    title: 'Functions',
    items: [
      { label: 'sin', latex: '\\sin\\left(#?\\right)', title: 'Sine (radians, or degrees with °)' },
      { label: 'cos', latex: '\\cos\\left(#?\\right)', title: 'Cosine' },
      { label: 'tan', latex: '\\tan\\left(#?\\right)', title: 'Tangent' },
      { label: 'asin', latex: '\\arcsin\\left(#?\\right)', title: 'Inverse sine' },
      { label: 'acos', latex: '\\arccos\\left(#?\\right)', title: 'Inverse cosine' },
      { label: 'atan', latex: '\\arctan\\left(#?\\right)', title: 'Inverse tangent' },
      { label: 'ln', latex: '\\ln\\left(#?\\right)', title: 'Natural logarithm' },
      { label: 'log', latex: '\\log\\left(#?\\right)', title: 'Base-10 logarithm' },
      { label: 'exp', latex: '\\exp\\left(#?\\right)', title: 'Exponential' },
      { label: 'min', latex: '\\min\\left(#?,#?\\right)', title: 'Minimum' },
      { label: 'max', latex: '\\max\\left(#?,#?\\right)', title: 'Maximum' },
      { label: 'seq', latex: '\\mathrm{seq}\\left(#?,#?\\right)', title: 'seq(start, end) or seq(start, end, step): a vector, e.g. seq(0, n-1)' },
      { label: 'let', latex: '\\mathrm{let}\\left(#?,#?,#?\\right)', title: 'let(name, value, …, expression): local names, e.g. let(i, seq(0, n-1), r·cos(2π·i/n))' },
      { label: 'angle', latex: '\\mathrm{angle}\\left(#?,#?\\right)', title: 'angle(x, y): direction of the vector (x, y), 0 … 360°' },
      { label: 'map', latex: '\\mathrm{map}\\left(#?,#?\\right)', title: 'map(f, v): calls the user function f for each entry of v, e.g. map(N_R, c_v)' },
      { label: 'linterp', latex: '\\mathrm{linterp}\\left(#?,#?,#?\\right)', title: 'linterp(xs, ys, x): linear interpolation (xs increasing or decreasing)' },
      { label: 'stack', latex: '\\mathrm{stack}\\left(#?,#?\\right)', title: 'stack(a, b, …): joins scalars and vectors into one vector' },
      { label: 'if', latex: '\\mathrm{if}\\left(#?,#?,#?\\right)', title: 'if(condition, value if true, value if false), e.g. if(N > 0 kN, 1, 2.5)' },
      { label: 'if block', latex: '\\begin{array}{|l}\\mathrm{if}\\ #?\\\\\\quad #?\\\\\\mathrm{else}\\\\\\quad #?\\end{array}', title: 'Mathcad-style if block: if condition / value / else / value (add "else if" lines as needed)' },
    ],
  },
];

const greek = (pairs: [string, string][]): PaletteItem[] =>
  pairs.map(([cmd, ch]) => ({ label: ch, latex: `\\${cmd}`, title: `${cmd}  (type the Latin letter, then Ctrl+G)`, math: true }));

export const SYMBOLS: PaletteSection[] = [
  {
    title: 'Greek lowercase',
    items: greek([
      ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ε'], ['zeta', 'ζ'], ['eta', 'η'],
      ['theta', 'θ'], ['kappa', 'κ'], ['lambda', 'λ'], ['mu', 'μ'], ['nu', 'ν'], ['xi', 'ξ'], ['rho', 'ρ'],
      ['sigma', 'σ'], ['tau', 'τ'], ['phi', 'φ'], ['chi', 'χ'], ['psi', 'ψ'], ['omega', 'ω'],
    ]),
  },
  {
    title: 'Greek uppercase',
    items: greek([['Gamma', 'Γ'], ['Delta', 'Δ'], ['Theta', 'Θ'], ['Lambda', 'Λ'], ['Sigma', 'Σ'], ['Phi', 'Φ'], ['Psi', 'Ψ'], ['Omega', 'Ω']]),
  },
];

export const CONSTANTS: PaletteSection[] = [
  {
    title: 'Built-in constants',
    items: [
      { label: 'π', latex: '\\pi ', title: 'π = 3.14159…  ( Ctrl+Shift+P )', math: true },
      { label: 'e', latex: 'e', title: 'Euler’s number = 2.71828…', math: true },
      { label: 'g', latex: 'g', title: 'Standard gravity = 9.80665 m/s²', math: true },
      { label: '∞', latex: '\\infty ', title: 'Infinity = 10³⁰⁷', math: true },
      { label: '%', latex: '\\%', title: 'Percent = 0.01' },
    ],
  },
];

const unit = (sym: string, title: string, label = sym): PaletteItem => ({ label, latex: `\\unit{${sym}}`, title });

export const UNITS_PALETTE: PaletteSection[] = [
  { title: 'Length', items: [unit('mm', 'millimetre'), unit('cm', 'centimetre'), unit('m', 'metre'), unit('km', 'kilometre'), unit('in', 'inch'), unit('ft', 'foot')] },
  { title: 'Force', items: [unit('N', 'newton'), unit('kN', 'kilonewton'), unit('MN', 'meganewton'), unit('lbf', 'pound-force'), unit('kip', 'kip')] },
  {
    title: 'Moment and distributed load',
    items: [
      { label: 'kN·m', latex: '\\unit{kN}\\cdot\\unit{m}', title: 'kilonewton metre' },
      { label: 'kN·mm', latex: '\\unit{kN}\\cdot\\unit{mm}', title: 'kilonewton millimetre' },
      { label: 'kN/m', latex: '\\frac{\\unit{kN}}{\\unit{m}}', title: 'kilonewton per metre' },
      { label: 'kN/m²', latex: '\\frac{\\unit{kN}}{\\unit{m}^2}', title: 'kilonewton per square metre' },
      { label: 'kN/m³', latex: '\\frac{\\unit{kN}}{\\unit{m}^3}', title: 'kilonewton per cubic metre (unit weight)' },
    ],
  },
  { title: 'Stress', items: [unit('Pa', 'pascal'), unit('kPa', 'kilopascal'), unit('MPa', 'megapascal'), unit('GPa', 'gigapascal'), unit('psi', 'pound per sq. inch'), unit('ksi', 'kip per sq. inch')] },
  {
    title: 'Mass, time, angle, temperature',
    items: [
      unit('kg', 'kilogram'),
      unit('tonne', 'tonne'),
      { label: 'kg/m³', latex: '\\frac{\\unit{kg}}{\\unit{m}^3}', title: 'density' },
      unit('s', 'second'),
      unit('Hz', 'hertz'),
      { label: '°', latex: '\\degree ', title: 'degree' },
      unit('rad', 'radian'),
      unit('K', 'kelvin'),
      { label: '°C', latex: '\\degree\\unit{C}', title: 'degree Celsius' },
    ],
  },
];
