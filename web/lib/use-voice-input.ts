"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAsrWebSocketUrl,
  reduceAsrTranscript,
  renderTranscriptDraft,
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

function voiceErrorMessage(message: string): string {
  if (message === "ASR_DISABLED") return "语音输入暂时没有开启";
  if (message === "ASR_API_KEY_MISSING") return "语音输入还没配置好";
  if (message === "websocket failed") return "语音输入断开了";
  return message || "没有拿到麦克风权限";
}

export function useVoiceInput({ letterId, getBaseText, onDraft }: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptRef = useRef<AsrTranscriptState>({
    confirmedText: "",
    partialText: "",
  });
  const baseTextRef = useRef("");
  const sampleBufferRef = useRef<number[]>([]);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const asrReadyRef = useRef(false);

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    asrReadyRef.current = false;
    sampleBufferRef.current = [];
  }, []);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (asrReadyRef.current) {
        flushPendingSamples(sampleBufferRef.current, ws, true);
      }
      ws.send(JSON.stringify({ type: "stop" }));
    }
    activeRef.current = false;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

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
        if (data.type === "asr.partial" || data.type === "asr.final") {
          transcriptRef.current = reduceAsrTranscript(transcriptRef.current, {
            type: data.type,
            text: data.text ?? "",
          });
          onDraft(renderTranscriptDraft(baseTextRef.current, transcriptRef.current));
        } else if (data.type === "asr.error") {
          setError(data.message ?? "语音输入断开了");
          setStatus("error");
          activeRef.current = false;
          cleanup();
        }
      };
      const opened = new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("websocket failed"));
      });
      const ready = new Promise<void>((resolve, reject) => {
        ws.onmessage = (event) => {
          let data: { type?: string; message?: string };
          try {
            data = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (data.type === "asr.ready") {
            ws.onmessage = handleMessage;
            asrReadyRef.current = true;
            flushPendingSamples(sampleBufferRef.current, ws, false);
            resolve();
            return;
          }
          if (data.type === "asr.error") {
            reject(new Error(data.message ?? "语音输入不可用"));
          }
        };
      });
      ws.onclose = () => {
        wsRef.current = null;
        activeRef.current = false;
        cleanup();
        setStatus((s) => (s === "error" ? "error" : "idle"));
      };
      ws.onerror = () => {
        setError("语音输入断开了");
        setStatus("error");
        activeRef.current = false;
        cleanup();
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
      streamRef.current = stream;
      const audioWindow = window as WebkitAudioWindow;
      const AudioContextCtor =
        audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("AudioContext unavailable");
      }
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(channel, audioContext.sampleRate);
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
      processor.connect(audioContext.destination);
      setStatus("listening");

      await opened;
      if (sessionRef.current !== session) return;
      ws.onerror = () => {
        setError("语音输入断开了");
        setStatus("error");
        activeRef.current = false;
        cleanup();
      };
      await ready;
      if (sessionRef.current !== session) return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(voiceErrorMessage(message));
      setStatus("error");
      activeRef.current = false;
      cleanup();
      wsRef.current?.close();
      wsRef.current = null;
    }
  }, [cleanup, getBaseText, letterId, onDraft]);

  useEffect(() => cleanup, [cleanup]);

  return {
    status,
    error,
    isListening: status === "listening" || status === "connecting",
    start,
    stop,
  };
}
