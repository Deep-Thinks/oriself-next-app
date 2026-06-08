export type VoiceInputMode = "toggle" | "hold";

export interface AsrTranscriptState {
  confirmedText: string;
  partialText: string;
}

export interface AsrTranscriptEvent {
  type: "asr.partial" | "asr.final";
  text: string;
}

export function resolveVoiceInputMode(pointerType?: string): VoiceInputMode;

export function shouldToggleVoiceOnClick(
  lastHoldEndedAt: number,
  now?: number,
): boolean;

export type AsrStopAction = "send-now" | "defer-until-ready" | "discard";

export function resolveAsrStopAction(
  session: number,
  isReady: boolean,
): AsrStopAction;

export function formatVoiceErrorMessage(message: string): string;

export type TextareaResizeMode = "autosize" | "freeze";

export function resolveTextareaResizeMode(
  isHoldRecording: boolean,
  isListening: boolean,
): TextareaResizeMode;

export function shouldFocusVoiceDraftFromAsr(
  suppressFocus: boolean,
): boolean;

export function buildAsrWebSocketUrl(
  sessionId: string,
  href?: string,
): string;

export function reduceAsrTranscript(
  state: AsrTranscriptState,
  event: AsrTranscriptEvent,
): AsrTranscriptState;

export function renderTranscriptDraft(
  existingText: string,
  state: AsrTranscriptState,
): string;
