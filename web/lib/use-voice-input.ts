"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAsrWebSocketUrl,
  formatVoiceErrorMessage,
  reduceAsrTranscript,
  renderTranscriptDraft,
  resolveAsrStopAction,
} from "./voice-input.js";
import type { AsrTranscriptState } from "./voice-input";

type VoiceStatus = "idle" | "connecting" | "listening" | "error";
type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface Options {
  letterId: string;
  getBaseText: () => string;
  onDraft: (text: string) => void;
}

const CHUNK_SAMPLES = 1600; // 100ms @ 16kHz
const MAX_BUFFERED_SAMPLES = 16000 * 10;
// 静音判定：录了一会儿后峰值仍低于此（int16，≈ -54dBFS，远低于任何真实麦克风噪声底）
// 就判为"没采到声音"。真实麦克风即使安静也有噪声底，峰值远不止 60。
const SILENCE_PEAK_INT16 = 60;
const SILENCE_CHECK_MS = 3500;
const QUIET_BLOCK_THRESHOLD = 0.03;
const QUIET_BLOCK_TARGET = 0.22;
const MAX_AUTO_GAIN = 12;

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    peak = Math.max(peak, Math.abs(input[i]));
  }
  const gain =
    peak > 0 && peak < QUIET_BLOCK_THRESHOLD
      ? Math.min(MAX_AUTO_GAIN, QUIET_BLOCK_TARGET / peak)
      : 1;

  if (inputRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = floatToInt16(input[i] * gain);
    return out;
  }
  const ratio = inputRate / 16000;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count += 1;
    }
    out[i] = floatToInt16((count ? sum / count : input[start] ?? 0) * gain);
  }
  return out;
}

function floatToInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function int16ToBytes(input: Int16Array): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < input.length; i++) {
    view.setInt16(i * 2, input[i], true);
  }
  return out;
}

function drainPendingSamples(pending: number[]): Int16Array | null {
  if (pending.length === 0) return null;
  const chunk = new Int16Array(pending.splice(0, pending.length));
  return chunk.length > 0 ? chunk : null;
}

function flushPendingSamples(
  pending: number[],
  ws: WebSocket,
  includeTail: boolean,
): void {
  while (pending.length >= CHUNK_SAMPLES) {
    const chunk = new Int16Array(pending.splice(0, CHUNK_SAMPLES));
    ws.send(int16ToBytes(chunk));
  }
  if (includeTail) {
    const tail = drainPendingSamples(pending);
    if (tail) ws.send(int16ToBytes(tail));
  }
}

export function useVoiceInput({ letterId, getBaseText, onDraft }: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // ScriptProcessor 必须连到能抵达 destination 的节点才会触发 onaudioprocess；
  // 直连 destination 会把麦克风原声回放出来（自己听见自己）。中间挂一个 gain=0
  // 的静音节点：保证音频被处理、但不外放。
  const muteRef = useRef<GainNode | null>(null);
  const transcriptRef = useRef<AsrTranscriptState>({
    confirmedText: "",
    partialText: "",
  });
  const baseTextRef = useRef("");
  const sampleBufferRef = useRef<number[]>([]);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const asrReadyRef = useRef(false);
  const stopWhenReadyRef = useRef(false);
  // 静音检测：累计本次会话采到的最大振幅（int16）。若一直接近 0，说明麦克风
  // 静音/选错设备/系统没授权——不是 ASR 的问题，给用户一个明确提示而不是默默无字。
  const inputMaxRef = useRef(0);
  const silenceTimerRef = useRef<number | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    clearSilenceTimer();
    const ws = wsRef.current;
    wsRef.current = null;
    if (
      ws &&
      (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
    ) {
      ws.close(1000, "voice input cleanup");
    }
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    muteRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    asrReadyRef.current = false;
    stopWhenReadyRef.current = false;
    sampleBufferRef.current = [];
  }, [clearSilenceTimer]);

  const closeInput = useCallback(() => {
    clearSilenceTimer();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    muteRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, [clearSilenceTimer]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    const session = sessionRef.current;
    const action = resolveAsrStopAction(session, asrReadyRef.current);
    if (action === "defer-until-ready") {
      stopWhenReadyRef.current = true;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (action === "send-now") {
        flushPendingSamples(sampleBufferRef.current, ws, true);
        ws.send(JSON.stringify({ type: "stop" }));
      }
    }
    activeRef.current = false;
    closeInput();
    setStatus("idle");
  }, [closeInput]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("这个浏览器暂时不能录音");
      setStatus("error");
      return;
    }
    activeRef.current = true;
    setError(null);
    setStatus("connecting");
    transcriptRef.current = { confirmedText: "", partialText: "" };
    baseTextRef.current = getBaseText();
    stopWhenReadyRef.current = false;
    inputMaxRef.current = 0;
    clearSilenceTimer();
    const session = sessionRef.current + 1;
    sessionRef.current = session;

    try {
      const ws = new WebSocket(buildAsrWebSocketUrl(letterId, window.location.href));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      const handleMessage = (event: MessageEvent) => {
        let data: { type?: string; text?: string; message?: string };
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (sessionRef.current !== session) return;
        if (data.type === "asr.partial" || data.type === "asr.final") {
          // 真的出字了，撤掉可能已显示的"没采到声音"提示
          if (data.text) {
            clearSilenceTimer();
            setError(null);
          }
          transcriptRef.current = reduceAsrTranscript(transcriptRef.current, {
            type: data.type,
            text: data.text ?? "",
          });
          onDraft(renderTranscriptDraft(baseTextRef.current, transcriptRef.current));
        } else if (data.type === "asr.error" && sessionRef.current === session) {
          setError(formatVoiceErrorMessage(data.message ?? "语音输入断开了"));
          setStatus("error");
          activeRef.current = false;
          cleanup();
        }
      };
      let rejectReady: (reason?: unknown) => void = () => {};
      const ready = new Promise<void>((resolve, reject) => {
        rejectReady = reject;
        ws.onmessage = (event) => {
          let data: { type?: string; message?: string };
          try {
            data = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (sessionRef.current !== session) return;
          if (data.type === "asr.ready") {
            ws.onmessage = handleMessage;
            asrReadyRef.current = true;
            flushPendingSamples(sampleBufferRef.current, ws, stopWhenReadyRef.current);
            if (stopWhenReadyRef.current) {
              ws.send(JSON.stringify({ type: "stop" }));
              stopWhenReadyRef.current = false;
            }
            resolve();
            return;
          }
          if (data.type === "asr.error") {
            reject(new Error(data.message ?? "语音输入不可用"));
          }
        };
      });
      ws.onclose = () => {
        if (sessionRef.current !== session) return;
        wsRef.current = null;
        activeRef.current = false;
        cleanup();
        rejectReady(new Error("websocket failed"));
        setStatus((s) => (s === "error" ? "error" : "idle"));
      };
      ws.onerror = () => {
        if (sessionRef.current !== session) return;
        setError(formatVoiceErrorMessage("websocket failed"));
        setStatus("error");
        activeRef.current = false;
        cleanup();
        rejectReady(new Error("websocket failed"));
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        activeRef.current = false;
        return;
      }
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const audioWindow = window as WebkitAudioWindow;
      const AudioContextCtor =
        audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("AudioContext unavailable");
      }
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      // iOS Safari / 部分移动浏览器即使在用户手势里创建，AudioContext 仍可能
      // 处于 suspended，导致 onaudioprocess 永不触发、采集不到任何音频。显式
      // resume；失败不阻断（桌面通常已是 running）。
      if (audioContext.state === "suspended") {
        await audioContext.resume().catch(() => {});
      }
      if (sessionRef.current !== session || !activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      const mute = audioContext.createGain();
      mute.gain.value = 0;
      muteRef.current = mute;
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(channel, audioContext.sampleRate);
        for (let i = 0; i < pcm.length; i++) {
          const amp = pcm[i] < 0 ? -pcm[i] : pcm[i];
          if (amp > inputMaxRef.current) inputMaxRef.current = amp;
        }
        const pending = sampleBufferRef.current;
        for (let i = 0; i < pcm.length; i++) pending.push(pcm[i]);
        if (pending.length > MAX_BUFFERED_SAMPLES) {
          pending.splice(0, pending.length - MAX_BUFFERED_SAMPLES);
        }
        if (asrReadyRef.current && ws.readyState === WebSocket.OPEN) {
          flushPendingSamples(pending, ws, false);
        }
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(audioContext.destination);
      setStatus("listening");

      // 录了一会儿后若峰值仍接近 0 → 麦克风没采到声音（静音/选错设备/系统没授权），
      // 不是 ASR 问题。给一句明确提示，避免"录了没反应"的困惑。不打断录音，
      // 用户改好设备后可继续说话。
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => {
        if (
          sessionRef.current === session &&
          activeRef.current &&
          inputMaxRef.current < SILENCE_PEAK_INT16
        ) {
          setError("好像没采到声音 · 检查麦克风是否静音、或在系统/浏览器里选对了输入设备");
        }
      }, SILENCE_CHECK_MS);

      await ready;
      if (sessionRef.current !== session) return;
    } catch (err) {
      if (sessionRef.current !== session || !activeRef.current) return;
      const message = err instanceof Error ? err.message : "";
      setError(formatVoiceErrorMessage(message));
      setStatus("error");
      activeRef.current = false;
      cleanup();
      wsRef.current?.close();
      wsRef.current = null;
    }
  }, [cleanup, clearSilenceTimer, getBaseText, letterId, onDraft]);

  useEffect(() => cleanup, [cleanup]);

  return {
    status,
    error,
    isListening: status === "listening" || status === "connecting",
    start,
    stop,
  };
}
