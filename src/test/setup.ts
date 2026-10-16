import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// 每個測試後卸載已渲染的元件
afterEach(() => cleanup());
