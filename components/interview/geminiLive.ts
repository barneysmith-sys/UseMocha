import { liveSetupMessage } from "@/lib/interview/livePrompt";
import { RoomAudio } from "./roomAudio";

type Reply = (line: string) => void;

export type LiveEvents = {
  onInterim: (text: string) => void;
  onCandidate: (transcript: string, reply: Reply) => void;
  onStatus: (status: "speaking" | "listening" | "connecting") => void;
  onLevel: (level: number) => void;
  onFallback: (reason: string) => void;
};

type ToolCall = { name?: string; id?: string; args?: { transcript?: string } };

export class GeminiLive {
  private socket: WebSocket | null = null;
  private audio: RoomAudio;
  private events: LiveEvents;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meter: number | null = null;
  private inputRate = 48000;
  private pendingId: string | null = null;
  private transcript = "";
  private handled = false;
  private expectSpeech = false;
  private playing = false;
  private loudSince = 0;
  private closed = false;
  private upload = true;
  private listenTimer = 0;

  constructor(audio: RoomAudio, events: LiveEvents) {
    this.audio = audio;
    this.events = events;
  }

  async connect(websocketUrl: string): Promise<void> {
    this.events.onStatus("connecting");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const ctx = this.audio.context;
    this.inputRate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(this.analyser);
    this.analyser.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);
    processor.onaudioprocess = (event) => this.onMic(event.inputBuffer.getChannelData(0));
    this.meter = window.setInterval(() => this.measure(), 80);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => fail(new Error("Live voice timed out")), 8000);
      const succeed = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      };
      const socket = new WebSocket(websocketUrl);
      this.socket = socket;
      socket.onerror = () => fail(new Error("Live voice connection failed"));
      socket.onclose = () => {
        if (!settled) fail(new Error("Live voice connection closed"));
        else if (!this.closed) this.events.onFallback("The live voice connection dropped.");
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        this.onMessage(event.data, succeed);
      };
      socket.onopen = () => socket.send(JSON.stringify(liveSetupMessage()));
    });
  }

  say(line: string) {
    this.expectSpeech = true;
    this.handled = true;
    this.upload = false;
    this.events.onStatus("speaking");
    if (this.pendingId) {
      this.send({
        toolResponse: {
          functionResponses: [{ id: this.pendingId, name: "submit_candidate_turn", response: { say: line } }],
        },
      });
      this.pendingId = null;
      return;
    }
    this.send({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: `SAY VERBATIM:\n${line}` }] }],
        turnComplete: true,
      },
    });
  }

  interrupt() {
    this.audio.stop();
    this.playing = false;
    this.upload = true;
    this.expectSpeech = false;
  }

  close() {
    this.closed = true;
    this.audio.stop();
    window.clearTimeout(this.listenTimer);
    if (this.meter) window.clearInterval(this.meter);
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.socket?.close();
  }

  private onMic(samples: Float32Array) {
    if (!this.upload || this.socket?.readyState !== WebSocket.OPEN) return;
    const pcm = downsample(samples, this.inputRate, 16000);
    if (pcm.length === 0) return;
    const bytes = new Uint8Array(pcm.buffer);
    this.send({
      realtimeInput: {
        audio: { data: bytesToBase64(bytes), mimeType: "audio/pcm;rate=16000" },
      },
    });
  }

  private measure() {
    if (!this.analyser) return;
    const bins = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(bins);
    let sum = 0;
    for (const value of bins) {
      const centered = (value - 128) / 128;
      sum += centered * centered;
    }
    const level = Math.min(1, Math.sqrt(sum / bins.length) * 4);
    this.events.onLevel(level);
    if (!this.playing) {
      this.loudSince = 0;
      return;
    }
    if (level > 0.18) {
      if (!this.loudSince) this.loudSince = performance.now();
      if (performance.now() - this.loudSince > 280) {
        this.interrupt();
        this.events.onStatus("listening");
      }
    } else {
      this.loudSince = 0;
    }
  }

  private onMessage(raw: string, ready?: (value: void) => void) {
    let message: {
      setupComplete?: unknown;
      toolCall?: { functionCalls?: ToolCall[] };
      serverContent?: {
        interrupted?: boolean;
        turnComplete?: boolean;
        waitingForInput?: boolean;
        inputTranscription?: { text?: string };
        interimInputTranscription?: { text?: string };
        modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
      };
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.setupComplete && ready) ready();
    const content = message.serverContent;
    if (content?.interrupted) this.interrupt();
    const interim = content?.interimInputTranscription?.text;
    if (interim) this.events.onInterim(interim);
    const piece = content?.inputTranscription?.text;
    if (piece) {
      this.transcript = `${this.transcript} ${piece}`.trim();
      this.handled = false;
      this.events.onInterim(this.transcript);
    }
    const calls = message.toolCall?.functionCalls ?? [];
    for (const call of calls) {
      if (call.name !== "submit_candidate_turn") continue;
      this.pendingId = call.id ?? null;
      this.finishTurn(call.args?.transcript || this.transcript);
    }
    if (content?.modelTurn?.parts && this.expectSpeech) {
      for (const part of content.modelTurn.parts) {
        const data = part.inlineData?.data;
        if (!data) continue;
        const rate = Number(part.inlineData?.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
        this.audio.playPcm16(data, rate);
        this.playing = true;
        this.upload = false;
        this.events.onStatus("speaking");
        this.armListen();
      }
    }
    if (content?.turnComplete) this.armListen();
  }

  private armListen() {
    window.clearTimeout(this.listenTimer);
    this.listenTimer = window.setTimeout(() => {
      this.playing = false;
      this.upload = true;
      this.expectSpeech = false;
      if (!this.handled && this.transcript.trim()) this.finishTurn(this.transcript);
      else if (!this.closed) this.events.onStatus("listening");
    }, this.audio.remaining * 1000 + 160);
  }

  private finishTurn(transcript: string) {
    const text = transcript.trim();
    this.transcript = "";
    if (this.handled || !text) return;
    this.handled = true;
    this.events.onCandidate(text, (line) => this.say(line));
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }
}

function downsample(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) {
    const same = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) same[i] = floatToInt16(input[i] ?? 0);
    return same;
  }
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) out[i] = floatToInt16(input[Math.floor(i * ratio)] ?? 0);
  return out;
}

function floatToInt16(value: number) {
  const sample = Math.max(-1, Math.min(1, value));
  return sample < 0 ? sample * 0x8000 : sample * 0x7fff;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
