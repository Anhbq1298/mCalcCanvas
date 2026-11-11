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
      { label: 'x!', latex: '#@!', title: 'Factorial (integer 0 to 170)', math: true },
      { label: '%', latex: '\\%', title: 'Percent (= 0.01)' },
      { label: '( )', latex: '\\left(#@\\right)', title: "Parentheses  ( ' )" },
      { label: ',', latex: ',', title: 'Argument separator (min, max)' },
      { label: 'xₐ', latex: '_{#?}', title: 'Literal subscript  ( . after a name )', math: true },
    ],
  },
  {
    title: 'Equation break',
    items: [
      { label: '+↲', latex: '\\begin{array}{l}#@+\\\\#?\\end{array}', title: 'Break after addition' },
      { label: '−↲', latex: '\\begin{array}{l}#@-\\\\#?\\end{array}', title: 'Break after subtraction' },
      { label: '·↲', latex: '\\begin{array}{l}#@\\cdot\\\\#?\\end{array}', title: 'Break after multiplication' },
      { label: '÷↲', latex: '\\begin{array}{l}#@\\div\\\\#?\\end{array}', title: 'Break after division' },
    ],
  },
  {
    title: 'Calculus',
    items: [
      { label: '⊛', latex: '\\operatorname{convolution}\\left(#?,#?,#?,#?,#?\\right)', title: 'Convolution: convolution(f, g, t, lower, upper), finite interval' },
      { label: '∗', latex: '\\operatorname{convolve}\\left(#?,#?\\right)', title: 'Discrete convolution (same-size, zero-padded)' },
      { label: 'd/dx', latex: '\\operatorname{derivative}\\left(#?,#?,#?\\right)', title: 'Derivative: derivative(expression, variable, point)', math: true },
      { label: '∇', latex: '\\operatorname{gradient}\\left(#?,\\begin{bmatrix}#?\\\\#?\\end{bmatrix},\\begin{bmatrix}#?\\\\#?\\end{bmatrix}\\right)', title: 'Gradient: gradient(expression, variables, point)' },
      { label: '∫dx', latex: '\\int_{#?}^{#?}\\left(#?\\right)\\,\\mathrm{d}#?', title: 'Definite integral (finite bounds; fill lower, upper, expression, variable)', math: true },
      { label: 'lim', latex: '\\lim_{#?\\to#?}\\left(#?\\right)', title: 'Limit (numerical finite-valued limit; fill variable, point, expression)' },
      { label: '∂/∂x', latex: '\\operatorname{partial}\\left(#?,#?,#?\\right)', title: 'Partial derivative: partial(expression, variable, point)', math: true },
      { label: 'x′', latex: '#?^{\\prime}\\left(#?\\right)', title: 'Prime derivative: f′(point), for a declared one-argument function', math: true },
      { label: '∏', latex: '\\prod_{#?=#?}^{#?}\\left(#?\\right)', title: 'Product (fill index, first, last, expression)' },
      { label: '∑', latex: '\\sum_{#?=#?}^{#?}\\left(#?\\right)', title: 'Summation (fill index, first, last, expression)' },
    ],
  },
  {
    title: 'Comparison',
    items: [
      { label: '∈', latex: '\\in ', title: 'Element of (value in a vector or matrix)' },
      { label: '=', latex: '\\equiv ', title: 'Equal to – comparison check  ( Ctrl+= )' },
      { label: '⊕', latex: '\\oplus ', title: 'Exclusive or' },
      { label: '>', latex: '>', title: 'Greater than' },
      { label: '≥', latex: '\\ge ', title: 'Greater than or equal  ( Ctrl+0 )' },
      { label: '<', latex: '<', title: 'Less than' },
      { label: '≤', latex: '\\le ', title: 'Less than or equal  ( Ctrl+9 )' },
      { label: '∧', latex: '\\land ', title: 'And: both comparisons hold (in an if condition)' },
      { label: '¬', latex: '\\neg\\left(#@\\right)', title: 'Not' },
      { label: '∨', latex: '\\lor ', title: 'Or: either comparison holds (in an if condition)' },
      { label: '≠', latex: '\\ne ', title: 'Not equal  ( Ctrl+3 )' },
    ],
  },
  {
    title: 'Definition and evaluation',
    items: [
      { label: '≔', latex: '\\coloneq ', title: 'Definition  ( : )' },
      { label: '=', latex: '=', title: 'Evaluate  ( = )' },
      { label: '≡', latex: '\\operatorname{global}\\left(#?,#?\\right)', title: 'Global definition: global(name, value), visible throughout this worksheet' },
      { label: '→', latex: '#@\\rightarrow ', title: 'Symbolic evaluation (bounded real algebra: simplify and differentiate)' },
    ],
  },
  {
    title: 'Engineering',
    items: [
      { label: 'z̄', latex: '\\overline{#@}', title: 'Complex conjugate (dimensionless complex values)', math: true },
      { label: '°', latex: '\\degree ', title: 'Degree (angle)' },
      { label: '∠', latex: '\\operatorname{phasor}\\left(#?,#?\\right)', title: 'Phasor angle: phasor(dimensionless magnitude, angle)' },
      { label: '∘', latex: '\\operatorname{compose}\\left(#?,#?,#?\\right)', title: 'Composition: compose(f, g, x)' },
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
      { label: 'if block', latex: '\\begin{array}{||l}\\mathrm{if}\\ #?\\\\\\quad\\left\\Vert #?\\right.\\\\\\mathrm{else}\\\\\\quad\\left\\Vert #?\\right.\\end{array}', title: 'Mathcad-style if block: if condition / value / else / value (add "else if" lines as needed)' },
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
      { label: 'i', latex: '\\imaginaryI ', title: 'Imaginary unit; plain i stays a worksheet variable', math: true },
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
