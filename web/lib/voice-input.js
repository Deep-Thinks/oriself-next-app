export function resolveVoiceInputMode(pointerType) {
  return pointerType === "touch" || pointerType === "pen" ? "hold" : "toggle";
}

export function shouldToggleVoiceOnClick(lastHoldEndedAt, now = Date.now()) {
  return now - lastHoldEndedAt > 700;
}

export function resolveAsrStopAction(session, isReady) {
  if (session <= 0) return "discard";
  return isReady ? "send-now" : "defer-until-ready";
}

export function formatVoiceErrorMessage(message) {
  if (message === "ASR_DISABLED") return "语音输入暂时没有开启";
  if (message === "ASR_API_KEY_MISSING") return "语音输入还没配置好";
  if (message === "websocket failed") return "语音输入断开了";
  if (/timeout|timed out/i.test(message || "")) return "这次没听清，可以再试一次";
  return message || "没有拿到麦克风权限";
}

export function resolveTextareaResizeMode(isHoldRecording, isListening) {
  return isHoldRecording && isListening ? "freeze" : "autosize";
}

export function shouldFocusVoiceDraftFromAsr(suppressFocus) {
  return !suppressFocus;
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
    if (state.confirmedText && event.text && state.confirmedText.includes(event.text)) {
      return { ...state, partialText: "" };
    }
    return { ...state, partialText: event.text };
  }
  if (state.confirmedText && state.confirmedText.includes(event.text)) {
    return { confirmedText: state.confirmedText, partialText: "" };
  }
  if (state.confirmedText && event.text.includes(state.confirmedText)) {
    return { confirmedText: event.text, partialText: "" };
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
