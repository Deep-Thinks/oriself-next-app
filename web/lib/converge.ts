import type { TurnStatus } from "./types";

export const MANUAL_CONVERGE_MIN_PROGRESS = 0.78;

interface ManualConvergeState {
  currentRound: number;
  isCompleted: boolean;
  isStreaming: boolean;
  isConverging: boolean;
  lastStatus: TurnStatus | null;
  progress: number | null;
}

export function canShowManualConvergeAction({
  currentRound,
  isCompleted,
  isStreaming,
  isConverging,
  lastStatus,
  progress,
}: ManualConvergeState): boolean {
  if (isCompleted || isStreaming || isConverging) return false;
  if (currentRound < 6) return false;
  if (lastStatus === "CONVERGE") return true;
  return typeof progress === "number" && progress >= MANUAL_CONVERGE_MIN_PROGRESS;
}
