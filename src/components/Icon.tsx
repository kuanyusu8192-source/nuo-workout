import spriteUrl from '../assets/icons.svg?url';

export type IconName =
  | 'home' | 'calendar' | 'list-checks' | 'utensils' | 'settings' | 'play' | 'pause'
  | 'plus' | 'minus' | 'trash-2' | 'history' | 'star' | 'flame' | 'check'
  | 'chevron-left' | 'chevron-right' | 'x' | 'scale' | 'dumbbell' | 'timer'
  | 'share-2' | 'download' | 'upload';

interface IconProps {
  name: IconName;
  size?: number;
  label?: string;
}

export function Icon({ name, size = 24, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
    >
      <use href={`${spriteUrl}#${name}`} />
    </svg>
  );
}
