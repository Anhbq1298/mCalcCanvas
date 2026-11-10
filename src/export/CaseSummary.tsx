import type { AvailableField } from '../components/inputResults/batchCalculation';
import type { InputResultConfig, InputResultRow } from '../documents/DocumentTypes';
import type { BatchResults } from '../engine/batch';
import type { CalculationResult } from '../engine/CalculationEngine';

/** First page of the case reports: every case with its inputs and outputs. */
function cellText(r: CalculationResult | undefined, labels?: Record<string,string>): { text: string; cls: string } {
  if (!r) return { text: '—', cls: '' };
  if (r.status === 'error') return { text: 'Error', cls: 'is-fail' };
  if (r.check) return { text: r.check.pass ? 'PASS' : 'FAIL', cls: r.check.pass ? 'is-pass' : 'is-fail' };
  const label=r.value && labels?.[String(r.value.number)];
  if(label) return {text:label,cls:label==='PASS'?'is-pass':label==='FAIL'?'is-fail':''};
  return { text: r.value?.text ?? '—', cls: '' };
}

export function CaseSummary({ config, fields, rows, results, stamp }: { config: InputResultConfig; fields: Map<string, AvailableField>; rows: InputResultRow[]; results: BatchResults; stamp: string }) {
  return (
    <div className="report-summary" data-testid="report-summary">
      <h1>{config.title || 'Table In&Out'}</h1>
      <p className="report-stamp">{stamp}</p>
      <table>
        <thead>
          <tr>
            <th>Case</th>
            {config.inputs.map((c) => (
              <th key={c.id}>
                {c.label}
                <small>{fields.get(c.regionId)?.unit ?? ''}</small>
              </th>
            ))}
            {config.outputs.map((c) => (
              <th key={c.id}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              {config.inputs.map((c) => (
                <td key={c.id} className="num">
                  {row.values[c.id] ?? fields.get(c.regionId)?.inputValue ?? '—'}
                </td>
              ))}
              {config.outputs.map((c) => {
                const t = cellText(results[row.id]?.regions?.[c.regionId],c.valueLabels);
                return (
                  <td key={c.id} className={`num ${t.cls}`}>
                    {t.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note">Each case follows: the full worksheet with that case's input values (highlighted inputs) and its results.</p>
    </div>
  );
}

