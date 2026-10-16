import { Card } from './Card';

/** 畫面占位：後續 agent 實作畫面時整個換掉。 */
export function ScreenPlaceholder({ name, hint }: { name: string; hint?: string }) {
  return (
    <div data-screen={name}>
      <Card title={name}>
        <p>{hint ?? '此畫面尚未實作（P3 占位）。'}</p>
      </Card>
    </div>
  );
}
