/** 「更多選項」圖示按鈕。共用 Icon 精靈圖沒有三點圖示，這裡用內嵌 SVG（不改共用元件）。 */
export function MoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="nuo-iconbtn" aria-label={label} title={label} onClick={onClick}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>
  );
}
