const TABS = ['今日', '歷史', '計畫', '飲食', '設定'] as const;

export function App() {
  return (
    <div>
      <h1>NUO Fit</h1>
      <nav>
        {TABS.map((label) => (
          <button type="button" key={label}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
