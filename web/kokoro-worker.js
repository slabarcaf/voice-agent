// Text-to-speech for the open-source engine (B): Kokoro-82M (open weights) running in the
// visitor's browser, off the main thread so the microphone VAD never stalls.
// It needs WebGPU: on the WASM backend it ran ~1.6x slower than real time, too slow to talk.
// The fp32 model (~330 MB) downloads once and is then cached by the browser.
// kokoro-js only ships English voices; the page speaks Spanish with the system voice.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts = null;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: "fp32",
        device: "webgpu",
        progress_callback: (p) => p.status === "progress" && self.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total }),
      });
      await tts.generate("Hi.", { voice: "af_heart" }); // compiles GPU shaders: the first call is ~3x slower
      self.postMessage({ type: "ready" });
    } else if (data.type === "speak") {
      const started = performance.now();
      const out = await tts.generate(data.text, { voice: data.voice || "af_heart" });
      self.postMessage({ type: "audio", id: data.id, audio: out.audio, rate: out.sampling_rate, ms: performance.now() - started }, [out.audio.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: data.id, error: String(err?.message || err) });
  }
};
