/** Capacitor 原生環境：把 Android 返回鍵轉成 nuo:back 事件。非原生環境不做事。 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { dispatchBackEvent } from './back';

export function setupNative(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => dispatchBackEvent());
}
