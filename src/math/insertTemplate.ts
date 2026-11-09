import { commands } from '../app/commands';
import { insertIntoActiveMath, templateToLatex } from './activeEditor';

/** Insert a palette template into the open equation, or start a new region with it. */
export function insertTemplate(latex: string): void {
  if (!insertIntoActiveMath(latex)) commands.insertMath(templateToLatex(latex));
}
