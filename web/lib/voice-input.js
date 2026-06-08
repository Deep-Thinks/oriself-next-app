export function resolveVoiceInputMode(pointerType) {
  return pointerType === "touch" || pointerType === "pen" ? "hold" : "toggle";
}

export function shouldToggleVoiceOnClick(lastHoldEndedAt, now = Date.now()) {
  return now - lastHoldEndedAt > 700;
}

export function buildAsrWebSocketUrl(sessionId, href) {
  const configured = process.env.NEXT_PUBLIC_ASR_WS_URL;
  if (configured) {
    const url = new URL(configured);
    url.searchParams.set("session_id", sessionId);
    return url.toString();
  }
  const base = new URL(href ?? "http://localhost:3000");
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/api/asr/ws";
  base.search = "";
  base.searchParams.set("session_id", sessionId);
  return base.toString();
}

export function reduceAsrTranscript(state, event) {
  if (event.type === "asr.partial") {
    return { ...state, partialText: event.text };
  }
  const separator =
    state.confirmedText && !/[，。！？；、\s]$/.test(state.confirmedText)
      ? " "
      : "";
  return {
    confirmedText: `${state.confirmedText}${separator}${event.text}`,
    partialText: "",
  };
}

export function renderTranscriptDraft(existingText, state) {
  const transcript = `${state.confirmedText}${state.partialText}`;
  if (!transcript) return existingText;
  if (!existingText.trim()) return transcript;
  return `${existingText}\n${transcript}`;
}
