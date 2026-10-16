import { afterEach, describe, expect, it, vi } from 'vitest';

const addListener = vi.fn();
const isNativePlatform = vi.fn();
vi.mock('@capacitor/app', () => ({ App: { addListener: (...a: unknown[]) => addListener(...a) } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

import { BACK_EVENT } from './back';
import { setupNative } from './native';

afterEach(() => vi.clearAllMocks());

describe('setupNative', () => {
  it('非原生環境不註冊', () => {
    isNativePlatform.mockReturnValue(false);
    setupNative();
    expect(addListener).not.toHaveBeenCalled();
  });

  it('原生環境註冊 backButton，觸發時送出 nuo:back', () => {
    isNativePlatform.mockReturnValue(true);
    setupNative();
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    const onEvent = vi.fn();
    window.addEventListener(BACK_EVENT, onEvent);
    addListener.mock.calls[0][1]();
    window.removeEventListener(BACK_EVENT, onEvent);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
