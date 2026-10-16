/** 動作 GIF（路徑 gifs/<gifFile>）；缺圖或載入失敗顯示占位。 */
import { useState } from 'preact/hooks';
import { Icon } from '../../components';

export function Gif({ file, alt = '', size }: { file: string | null | undefined; alt?: string; size: 'thumb' | 'full' }) {
  const [failed, setFailed] = useState(false);
  const base = size === 'thumb' ? 'exp-thumb' : 'exp-gif';
  if (!file || failed) {
    return (
      <div class={`${base} ${base}--placeholder`} role={alt ? 'img' : undefined} aria-label={alt ? `${alt}（無示範圖）` : undefined} aria-hidden={alt ? undefined : true}>
        <Icon name="dumbbell" size={size === 'thumb' ? 24 : 48} />
      </div>
    );
  }
  return (
    <img
      class={size === 'thumb' ? 'exp-thumb exp-thumb__img' : 'exp-gif'}
      src={`gifs/${file}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
