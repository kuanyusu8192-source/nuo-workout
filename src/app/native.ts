/** Capacitor 原生環境：把 Android 返回鍵轉成 nuo:back 事件。非原生環境不做事。 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { dispatchBackEvent } from './back';

export function setupNative(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => dispatchBackEvent());
}

/** 離開 App：原生環境呼叫 App.exitApp()；網頁環境沒有「離開」概念，維持 no-op（不 window.close，避免關掉使用者的分頁） */
export function exitApp(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.exitApp();
}
