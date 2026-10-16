import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';

export interface ChartWithTableProps {
  /** 圖表標題，同時作為表格 caption */
  title: string;
  /** 表頭，例如 ['日期', '容量 (kg)'] */
  headers: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string | number>>;
  /** 圖表本體（BarChart／LineChart） */
  children?: ComponentChildren;
}

/** 圖表外包一層：下方「顯示表格」切換，給無障礙與精確數值。 */
export function ChartWithTable({ title, headers, rows, children }: ChartWithTableProps) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <figure class="nuo-chartbox">
      <figcaption class="nuo-chartbox__title">{title}</figcaption>
      {children}
      <button type="button" class="nuo-linkbtn" aria-expanded={shown} aria-controls={id} onClick={() => setShown((s) => !s)}>
        {shown ? '隱藏表格' : '顯示表格'}
      </button>
      {shown ? (
        <div id={id} class="nuo-tablewrap">
          <table class="nuo-table">
            <caption class="nuo-sr-only">{title}</caption>
            <thead>
              <tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} class="num">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
