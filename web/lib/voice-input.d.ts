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
