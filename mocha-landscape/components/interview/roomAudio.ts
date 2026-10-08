export class RoomAudio {
  readonly context: AudioContext;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(context: AudioContext) {
    this.context = context;
  }

  playPcm16(base64: string, sampleRate: number) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const samples = Math.floor(bytes.length / 2);
    const channel = new Float32Array(samples);
    for (let i = 0; i < samples; i += 1) channel[i] = view.getInt16(i * 2, true) / 32768;
    const buffer = this.context.createBuffer(1, Math.max(1, samples), sampleRate);
    buffer.copyToChannel(channel, 0);
    this.play(buffer);
  }

  async playResponse(response: ArrayBuffer) {
    const buffer = await this.context.decodeAudioData(response.slice(0));
    this.play(buffer);
    return buffer.duration;
  }

  stop() {
    this.next = 0;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.sources.clear();
  }

  get active() {
    return this.sources.size > 0;
  }

  get remaining() {
    return Math.max(0, this.next - this.context.currentTime);
  }

  private play(buffer: AudioBuffer) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const start = Math.max(this.context.currentTime + 0.03, this.next);
    source.start(start);
    this.next = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

export function speechRecognitionAvailable() {
  if (typeof window === "undefined") return false;
  const host = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function listenForAnswer(handlers: {
  onPartial: (text: string) => void;
  onEnd: (text: string) => void;
  onError: (message: string) => void;
}) {
  const host = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let latest = "";
  let stopped = false;
  let timer = 0;
  const finish = () => {
    if (stopped) return;
    const words = latest.trim().match(/\S+/g)?.length ?? 0;
    if (words < 3) return;
    stopped = true;
    window.clearTimeout(timer);
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
    handlers.onEnd(latest.trim());
  };
  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i += 1) text += `${event.results[i]?.[0]?.transcript ?? ""} `;
    latest = text.trim();
    handlers.onPartial(latest);
    window.clearTimeout(timer);
    timer = window.setTimeout(finish, 2200);
  };
  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      handlers.onError("Microphone permission was blocked. Type your answer instead.");
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      handlers.onError("The microphone stalled. Type your answer, or try again.");
    }
  };
  recognition.onend = () => {
    if (!stopped && latest) finish();
  };
  try {
    recognition.start();
  } catch {
    handlers.onError("The microphone could not start. Type your answer instead.");
    return null;
  }
  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
    finish,
  };
}
