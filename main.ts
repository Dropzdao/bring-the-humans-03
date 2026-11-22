// main.ts — renders the make.fun TikTok ad (bring-the-humans-03) with Node stdlib only.
// Pipeline: synth audio (pure Node WAV) -> extract referral-card frames from the
// official press-pack webm (ffmpeg) -> render 1080x1920 frames from scene.html with
// a persistent headless Chromium driven over CDP (Node's built-in WebSocket client;
// one browser, one page, deterministic ?t= timeline via window.renderAt) ->
// assemble with ffmpeg (libx264 + AAC).
// Usage:
//   node main.ts            render the full 20s video (600 frames)
//   node main.ts --stills   render 3 test stills only (t=2.0, 7.0, 19.7) into previews/
//   node main.ts --frames N render only the first N frames (debug)
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';

const execFileAsync = promisify(execFile);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const DURATION_S = 20;
const TOTAL_FRAMES = FPS * DURATION_S; // 600
const WIDTH = 1080;
const HEIGHT = 1920;
const REFERRAL_CODE = '719p3y23';
const VIDEO_OUT = path.join(ROOT, 'makefun-tiktok-ad-1080x1920.mp4');
const FRAMES_DIR = path.join(ROOT, 'frames');
const CARD_FRAMES_DIR = path.join(ROOT, 'cardframes');
const PREVIEWS_DIR = path.join(ROOT, 'previews');
const AUDIO_PATH = path.join(ROOT, 'audio.wav');

function log(msg: string): void {
  console.log(`[render ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function run(cmd: string, args: string[], opts: { timeout?: number } = {}): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout: opts.timeout ?? 120000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function which(name: string): Promise<string | null> {
  try {
    return (await run('which', [name])).trim() || null;
  } catch {
    return null;
  }
}

async function findChromium(): Promise<string> {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const home = os.homedir();
  const cache = path.join(home, '.cache', 'ms-playwright');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      for (const cand of [
        path.join(cache, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        path.join(cache, dir, 'chrome-linux64', 'chrome'),
        path.join(cache, dir, 'chrome-linux', 'chrome'),
      ]) {
        if (fs.existsSync(cand)) return cand;
      }
    }
  }
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const p = await which(name);
    if (p) return p;
  }
  throw new Error('No Chromium binary found (set CHROMIUM_PATH)');
}

async function checkTools(): Promise<string> {
  await run('ffmpeg', ['-version']);
  const chromium = await findChromium();
  log(`ffmpeg OK; chromium: ${chromium}`);
  return chromium;
}

async function extractCardFrames(): Promise<void> {
  fs.mkdirSync(CARD_FRAMES_DIR, { recursive: true });
  const webm = path.join(ROOT, 'assets', 'makefun-card-9x16-transparent.webm');
  if (!fs.existsSync(webm)) throw new Error(`missing ${webm}`);
  const existing = fs.readdirSync(CARD_FRAMES_DIR).filter((f) => f.endsWith('.png'));
  if (existing.length >= 75) {
    log(`card frames already extracted (${existing.length})`);
    return;
  }
  await run('ffmpeg', ['-y', '-v', 'error', '-i', webm, '-vf', 'fps=30', path.join(CARD_FRAMES_DIR, 'f%03d.png')]);
  log(`extracted ${fs.readdirSync(CARD_FRAMES_DIR).length} card frames from the official webm`);
}

// ---- audio: cheerful synth loop, pure Node PCM -> WAV ----
const NOTE = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
// C4=60 ... chords as midi triples (1 bar each, 112 BPM, 4/4 => bar = 2.1429s)
const CHORDS: number[][] = [
  [48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48],
  [48, 52, 55], [43, 47, 50], [41, 45, 48], [43, 47, 50],
  [48, 52, 55], [48, 52, 55],
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88]; // C major pentatonic, 2 octaves
const MELODY = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 4, 2, 0, -1,
  2, 4, 5, 7, 5, 4, 2, 4, 5, 4, 2, 0, 1, 2, 0, 0];

function synthAudio(outPath: string): void {
  const sr = 44100;
  const bpm = 112;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const total = DURATION_S;
  const n = Math.floor(sr * total);
  const samples = new Float32Array(n);
  const add = (at: number, freq: number, dur: number, amp: number, kind: 'sine' | 'pluck' | 'kick'): void => {
    const start = Math.floor(at * sr);
    const len = Math.floor(dur * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sr;
      const u = i / len;
      let v = 0;
      if (kind === 'sine') {
        const env = Math.min(1, u * 8) * (1 - u * 0.7);
        v = Math.sin(2 * Math.PI * freq * t) * env;
      } else if (kind === 'pluck') {
        const env = Math.exp(-t * 9) * Math.min(1, t * 200);
        v = (Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(2 * Math.PI * freq * 2 * t)) * env;
      } else {
        const f = 130 + (45 - 130) * u;
        const env = Math.exp(-t * 22);
        v = Math.sin(2 * Math.PI * f * t) * env;
      }
      samples[start + i] += v * amp;
    }
  };
  // pads: one chord per bar
  CHORDS.forEach((chord, barIdx) => {
    const at = barIdx * bar;
    for (const midi of chord) {
      add(at, NOTE(midi), bar * 1.05, 0.05, 'sine');
      add(at, NOTE(midi + 12), bar * 1.05, 0.025, 'sine');
    }
  });
  // pluck melody: 8th notes
  const eighth = beat / 2;
  const steps = Math.floor(total / eighth);
  for (let s = 0; s < steps; s++) {
    const deg = MELODY[s % MELODY.length];
    const midi = PENTA[((deg % PENTA.length) + PENTA.length) % PENTA.length] + (deg >= PENTA.length ? 12 : 0);
    add(s * eighth, NOTE(midi), eighth * 1.8, 0.16, 'pluck');
  }
  // kick on beats 1 and 3 of each bar
  for (let b = 0; b * beat < total; b += 1) {
    if (b % 2 === 0) add(b * beat, 0, 0.18, 0.5, 'kick');
  }
  // master: fade in/out + normalize + write stereo 16-bit WAV
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fadeIn = Math.min(1, t / 0.4);
    const fadeOut = Math.min(1, (total - t) / 1.2);
    samples[i] *= fadeIn * fadeOut * 0.9;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = peak > 0 ? 0.5 / peak : 1;
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(2, 22); // stereo
  data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] * gain));
    const s = Math.round(v * 32767);
    data.writeInt16LE(s, 44 + i * 4);
    data.writeInt16LE(s, 44 + i * 4 + 2);
  }
  fs.writeFileSync(outPath, data);
  log(`audio written: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

// ---- frames via Chrome DevTools Protocol (Node built-in WebSocket; stdlib only) ----
type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function connectCdp(chromium: string): Promise<{ send: CdpSend; proc: ChildProcess }> {
  const port = 9333;
  const proc = spawn(chromium, [
    '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${WIDTH},${HEIGHT}`,
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*', 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl: string | null = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = list.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!wsUrl) {
    proc.kill();
    throw new Error('CDP did not come up');
  }
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('CDP websocket error'));
  });
  let id = 0;
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  ws.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result ?? {});
    }
  };
  const send: CdpSend = (method, params = {}) => {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  };
  return { send, proc };
}

async function renderFramesCdp(chromium: string, indices: number[], outDir: string, nameFn: (i: number) => string): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const { send, proc } = await connectCdp(chromium);
  try {
    await send('Page.enable');
    await send('Page.navigate', { url: `file://${path.join(ROOT, 'scene.html')}?t=0` });
    await new Promise((r) => setTimeout(r, 1500));
    // wait until the page is loaded and fonts are ready
    for (let tries = 0; tries < 20; tries++) {
      const st = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (st.result?.value === 'complete') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true, returnByValue: true });
    log('page loaded, fonts ready');
    let done = 0;
    for (const i of indices) {
      const out = path.join(outDir, nameFn(i));
      if (fs.existsSync(out)) { done++; continue; }
      const t = (i - 1) / FPS;
      await send('Runtime.evaluate', { expression: `renderAt(${t.toFixed(4)})` });
      if (t >= 17.5) {
        // make sure the new card frame image has decoded before the shot
        await send('Runtime.evaluate', {
          expression: `new Promise((res) => { const img = document.getElementById('cardframe'); if (img.complete && img.naturalWidth > 0) res(true); else { img.onload = () => res(true); img.onerror = () => res(false); setTimeout(() => res(true), 500); } })`,
          awaitPromise: true,
          returnByValue: true,
        });
      }
      await new Promise((r) => setTimeout(r, 16)); // let the renderer paint
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(String(shot.data), 'base64'));
      done++;
      if (done % 100 === 0) log(`frames ${done}/${indices.length}`);
    }
    log(`frames done: ${indices.length}`);
  } finally {
    proc.kill();
  }
}

async function assemble(): Promise<void> {
  await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%04d.png'),
    '-i', AUDIO_PATH, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', VIDEO_OUT]);
  log(`video written: ${VIDEO_OUT}`);
}

async function probe(): Promise<Record<string, unknown>> {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_name,codec_type,width,height,avg_frame_rate',
    '-of', 'json', VIDEO_OUT]);
  const j = JSON.parse(out) as { format: { duration: string; size: string }; streams: Array<Record<string, unknown>> };
  const video = j.streams.find((s) => s.codec_type === 'video') ?? {};
  const audio = j.streams.find((s) => s.codec_type === 'audio') ?? {};
  const summary = {
    file: VIDEO_OUT,
    bytes: Number(j.format.size),
    duration_s: Number(j.format.duration),
    width: video.width,
    height: video.height,
    fps: video.avg_frame_rate,
    video_codec: video.codec_name,
    audio_codec: audio.codec_name,
    referral_code: REFERRAL_CODE,
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function copyPreviews(): void {
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
  const picks: Array<[number, string]> = [
    [61, 'frame-first.png'],    // t=2.0s, opening scene settled
    [211, 'frame-middle.png'],  // t=7.0s, bounty board scene
    [592, 'frame-endcard.png'], // t=19.7s, code fully typed
  ];
  for (const [idx, name] of picks) {
    const src = path.join(FRAMES_DIR, `f${String(idx).padStart(4, '0')}.png`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PREVIEWS_DIR, name));
  }
  log(`previews in ${PREVIEWS_DIR}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stillsOnly = args.includes('--stills');
  const framesArg = args.find((a) => a.startsWith('--frames='));
  const chromium = await checkTools();
  await extractCardFrames();
  if (!fs.existsSync(AUDIO_PATH)) synthAudio(AUDIO_PATH);
  if (stillsOnly) {
    const picks: Array<[number, string]> = [
      [61, 'test-first.png'],
      [211, 'test-middle.png'],
      [592, 'test-endcard.png'],
    ];
    await renderFramesCdp(chromium, picks.map((p) => p[0]), PREVIEWS_DIR, (i) => picks.find((p) => p[0] === i)![1]);
    console.log(JSON.stringify({ mode: 'stills', previews: picks.map((p) => p[1]) }));
    return;
  }
  const count = framesArg ? Number(framesArg.split('=')[1]) : TOTAL_FRAMES;
  const indices = Array.from({ length: Math.min(count, TOTAL_FRAMES) }, (_, k) => k + 1);
  await renderFramesCdp(chromium, indices, FRAMES_DIR, (i) => `f${String(i).padStart(4, '0')}.png`);
  if (indices.length < TOTAL_FRAMES) {
    log(`partial render (${indices.length}/${TOTAL_FRAMES}) — skipping assembly`);
    return;
  }
  await assemble();
  copyPreviews();
  await probe();
}

main().catch((e: unknown) => {
  console.error('RENDER FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
