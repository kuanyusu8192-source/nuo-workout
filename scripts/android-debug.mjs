// 以 JDK 21 執行 Gradle assembleDebug（Capacitor 8 需要 JDK 21；不改系統環境變數，只在子程序設定 JAVA_HOME）。
// 可用環境變數 NUO_JAVA_HOME 覆寫。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findJdk21() {
  if (process.env.NUO_JAVA_HOME) return process.env.NUO_JAVA_HOME;
  const base = 'C:/Program Files/Microsoft';
  const hit = fs.existsSync(base) && fs.readdirSync(base).find((d) => d.startsWith('jdk-21'));
  return hit ? path.join(base, hit) : process.env.JAVA_HOME;
}

const javaHome = findJdk21();
if (!javaHome) {
  console.error('找不到 JDK 21，請設定 NUO_JAVA_HOME');
  process.exit(1);
}
const androidHome = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
console.log(`[android-debug] JAVA_HOME=${javaHome} ANDROID_HOME=${androidHome}`);
const r = spawnSync('cmd.exe', ['/c', path.resolve('android', 'gradlew.bat'), 'assembleDebug'], {
  cwd: 'android',
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome },
});
process.exit(r.status ?? 1);
