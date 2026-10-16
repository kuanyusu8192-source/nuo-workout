import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

/** 首次問卷三步（P3 Task 3.2）。路由 `#/onboarding`；完成後呼叫 onDone（預設導向今日）。 */
export interface OnboardingFlowProps {
  onDone?(): void;
}

export function OnboardingFlow(_props: OnboardingFlowProps = {}) {
  return <ScreenPlaceholder name="首次問卷" />;
}
