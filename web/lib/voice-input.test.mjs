import assert from "node:assert/strict";
import {
  buildAsrWebSocketUrl,
  formatVoiceErrorMessage,
  reduceAsrTranscript,
  renderTranscriptDraft,
  resolveTextareaResizeMode,
  resolveAsrStopAction,
  resolveVoiceInputMode,
  shouldFocusVoiceDraftFromAsr,
  shouldToggleVoiceOnClick,
} from "./voice-input.js";

assert.equal(resolveVoiceInputMode("mouse"), "toggle");
assert.equal(resolveVoiceInputMode("touch"), "hold");
assert.equal(resolveVoiceInputMode("pen"), "hold");
assert.equal(shouldToggleVoiceOnClick(0, 1000), true);
assert.equal(shouldToggleVoiceOnClick(800, 1000), false);
assert.equal(resolveAsrStopAction(1, true), "send-now");
assert.equal(resolveAsrStopAction(1, false), "defer-until-ready");
assert.equal(resolveAsrStopAction(0, false), "discard");
assert.equal(resolveAsrStopAction(3, false), "defer-until-ready");
assert.equal(resolveTextareaResizeMode(true, true), "freeze");
assert.equal(resolveTextareaResizeMode(true, false), "autosize");
assert.equal(resolveTextareaResizeMode(false, true), "autosize");
assert.equal(shouldFocusVoiceDraftFromAsr(false), true);
assert.equal(shouldFocusVoiceDraftFromAsr(true), false);
assert.equal(
  formatVoiceErrorMessage("request timeout after 23 seconds."),
  "这次没听清，可以再试一次",
);
assert.equal(
  formatVoiceErrorMessage("ASR_SESSION_TIMEOUT"),
  "这次没听清，可以再试一次",
);

assert.equal(
  buildAsrWebSocketUrl("letter-1", "https://next.oriself.com/letters/letter-1"),
  "wss://next.oriself.com/api/asr/ws?session_id=letter-1",
);
assert.equal(
  buildAsrWebSocketUrl("letter-1", "http://localhost:3000/letters/letter-1"),
  "ws://localhost:3000/api/asr/ws?session_id=letter-1",
);

const initial = { confirmedText: "", partialText: "" };
const withPartial = reduceAsrTranscript(initial, {
  type: "asr.partial",
  text: "我正在",
});
assert.deepEqual(withPartial, {
  confirmedText: "",
  partialText: "我正在",
});
const withFinal = reduceAsrTranscript(withPartial, {
  type: "asr.final",
  text: "我正在测试。",
});
assert.deepEqual(withFinal, {
  confirmedText: "我正在测试。",
  partialText: "",
});
assert.deepEqual(
  reduceAsrTranscript(withFinal, {
    type: "asr.partial",
    text: "我正在",
  }),
  {
    confirmedText: "我正在测试。",
    partialText: "",
  },
);
assert.deepEqual(
  reduceAsrTranscript(
    {
      confirmedText: "Hello World，这里是阿里巴巴",
      partialText: "",
    },
    {
      type: "asr.final",
      text: "Hello World，这里是阿里巴巴语音实验室。",
    },
  ),
  {
    confirmedText: "Hello World，这里是阿里巴巴语音实验室。",
    partialText: "",
  },
);
assert.equal(renderTranscriptDraft("", withFinal), "我正在测试。");
assert.equal(
  renderTranscriptDraft("原来输入", withFinal),
  "原来输入\n我正在测试。",
);

assert.equal(
  renderTranscriptDraft("用户手动改过的第一段\n我正在测试。", {
    confirmedText: "第二段语音。",
    partialText: "",
  }),
  "用户手动改过的第一段\n我正在测试。\n第二段语音。",
);

assert.equal(
  renderTranscriptDraft("用户正在编辑", {
    confirmedText: "",
    partialText: "新的实时中间结果",
  }),
  "用户正在编辑\n新的实时中间结果",
);

console.log("voice-input tests passed");
