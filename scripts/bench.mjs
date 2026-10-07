// Measures how long a spoken conversation turn takes against the deployed backend,
// step by step, and compares with the previous run.
//
//   node scripts/bench.mjs              # 5 turns
//   node scripts/bench.mjs --turns 8
//
// Each turn mimics the app: speech -> text (stt), then the streamed chat turn with
// its voice inline: timed to the `say` event (text on screen) and to `audio_end`
// (the whole clip is on the phone, which is when playback starts). Results are
// saved to perf/<timestamp>.json.
// It uses a throwaway anonymous user, deleted at the end. Costs about $0.03 a run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_KEY;

const turnsArg = process.argv.indexOf('--turns');
const TURNS = turnsArg > 0 ? Number(process.argv[turnsArg + 1]) : 5;
const SCENARIO = '00000000-0000-4000-8000-000000000001'; // cha chaan teng
// Functions that use the database run next to it (Oregon), as the app does.
// Speech recognition runs nearest to the caller.
const REGION = { 'x-region': 'us-west-2' };
const VOICE = 'zh-HK-HiuMaanNeural';
// What the "learner" says each turn. Synthesized once, then sent through stt like a recording.
const PHRASES = ['兩位，唔該', '我想要一個菠蘿包', '凍檸茶，少甜', '幾多錢呀', '唔該埋單', '有冇奶茶', '唔使喇，多謝', '好好食'];

async function call(token, name, body, raw = false) {
  const started = performance.now();
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${token}`,
      'content-type': raw ? 'audio/wav' : 'application/json',
      ...(name === 'stt' ? {} : REGION),
    },
    body: raw ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${res.status}: ${JSON.stringify(json)}`);
  return { ms: Math.round(performance.now() - started), json };
}

async function download(url) {
  const started = performance.now();
  const bytes = (await (await fetch(url)).arrayBuffer()).byteLength;
  return { ms: Math.round(performance.now() - started), bytes };
}

// The streamed chat turn: time to `say`, to the end of the inline audio, and to `done`.
async function chatStream(token, body) {
  const started = performance.now();
  const res = await fetch(`${URL_}/functions/v1/chat`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...REGION },
    body: JSON.stringify({ ...body, speak: true, voice: VOICE, rate: 1 }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  let audioMs;
  let audioBytes = 0;
  const decoder = new TextDecoder();
  let buffer = '';
  let sayMs;
  let say;
  let done;
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const event = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (event.type === 'say' && sayMs === undefined) {
        sayMs = Math.round(performance.now() - started);
        say = event.hanzi;
      } else if (event.type === 'audio') audioBytes += Buffer.from(event.b64, 'base64').length;
      else if (event.type === 'audio_end') audioMs = Math.round(performance.now() - started);
      else if (event.type === 'done') done = event;
      else if (event.type === 'error') throw new Error(`chat: ${event.error}`);
    }
  }
  return { sayMs, audioMs, audioBytes, doneMs: Math.round(performance.now() - started), say, done };
}

// The streamed voice: time until the first audio bytes arrive, and until all have.
async function ttsStream(token, text) {
  const started = performance.now();
  const query = new URLSearchParams({ text, voice: VOICE, rate: '1' });
  const res = await fetch(`${URL_}/functions/v1/tts?${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${token}`, ...REGION },
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${await res.text()}`);
  let firstMs;
  let bytes = 0;
  for await (const chunk of res.body) {
    if (firstMs === undefined) firstMs = Math.round(performance.now() - started);
    bytes += chunk.byteLength;
  }
  return { firstMs, allMs: Math.round(performance.now() - started), bytes, redirected: res.redirected };
}

const signup = await fetch(`${URL_}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ data: {} }),
}).then((r) => r.json());
const token = signup.access_token;
if (!token) throw new Error(`Anonymous sign-in failed: ${JSON.stringify(signup)}`);

// Learner recordings: 16 kHz WAV, the same format the app records.
const recordings = [];
for (let i = 0; i < TURNS; i++) {
  const { json } = await call(token, 'tts', { text: PHRASES[i % PHRASES.length], voice: 'zh-HK-WanLungNeural', rate: 1, format: 'wav' });
  recordings.push(new Uint8Array(await (await fetch(json.url)).arrayBuffer()));
}

console.log(`Benchmarking ${TURNS} spoken turns against ${new globalThis.URL(URL_).host}…\n`);

// The opener's voice comes back inside the session-start response.
const opener = await call(token, 'session-start', { scenario_id: SCENARIO, rate: 1 });
const openerTts = opener.json.audio ? { firstMs: 0 } : await ttsStream(token, opener.json.message.text_raw);
const sessionId = opener.json.session_id;

const turns = [];
for (let i = 0; i < TURNS; i++) {
  const stt = await call(token, 'stt', recordings[i], true);
  const chat = await chatStream(token, { session_id: sessionId, text: stt.json.text || PHRASES[i] });
  const timings = chat.done.timings;
  const turn = {
    heard: stt.json.text,
    reply: chat.say,
    stt_ms: stt.ms,
    chat_ms: chat.sayMs,
    chat_done_ms: chat.doneMs,
    tts_ms: chat.audioMs - chat.sayMs,
    audio_bytes: chat.audioBytes,
    download_ms: 0,
    total_ms: stt.ms + chat.audioMs,
    server: { stt: stt.json.timings, chat: { ...timings, model: timings.say - (timings.db_load ?? 0) }, tts: {} },
  };
  turns.push(turn);
  console.log(
    `turn ${i + 1}: ${(turn.total_ms / 1000).toFixed(1)}s  (heard "${turn.heard}", replied "${turn.reply}"${timings?.model_calls > 1 ? ', Mandarin retry' : ''})`,
  );
}

await call(token, 'delete-account', {});

// ---- Summary ----
const median = (xs) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const pick = (f) => turns.map(f).filter((v) => typeof v === 'number');
const sec = (ms) => (ms === undefined || Number.isNaN(ms) ? '   –' : `${(ms / 1000).toFixed(2)}s`);

const summary = {
  turn_total: { median: median(pick((t) => t.total_ms)), worst: Math.max(...pick((t) => t.total_ms)) },
  stt: median(pick((t) => t.stt_ms)),
  chat: median(pick((t) => t.chat_ms)),
  tts: median(pick((t) => t.tts_ms)),
  download: median(pick((t) => t.download_ms)),
  chat_server: {
    db_load: median(pick((t) => t.server.chat?.db_load)),
    usage: median(pick((t) => t.server.chat?.usage)),
    model: median(pick((t) => t.server.chat?.model)),
    gaps: median(pick((t) => t.server.chat?.gaps)),
    save: median(pick((t) => t.server.chat?.save)),
    total: median(pick((t) => t.server.chat?.total)),
    output_tokens: median(pick((t) => t.server.chat?.output_tokens)),
  },
  stt_server: { azure: median(pick((t) => t.server.stt?.azure)), total: median(pick((t) => t.server.stt?.total)) },
  tts_server: {
    azure: median(pick((t) => t.server.tts?.azure)),
    upload: median(pick((t) => t.server.tts?.upload)),
    total: median(pick((t) => t.server.tts?.total)),
  },
  chat_done: median(pick((t) => t.chat_done_ms)),
  opener: {
    session_start: opener.ms,
    tts: openerTts.firstMs,
    total: opener.ms + openerTts.firstMs,
  },
  mandarin_retries: turns.filter((t) => t.server.chat?.model_calls > 1).length,
};

const dir = join(root, 'perf');
mkdirSync(dir, { recursive: true });
const previousFile = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1);
const previous = previousFile ? JSON.parse(readFileSync(join(dir, previousFile), 'utf8')).summary : null;

// Database time before the reply text: the reads before the model call.
const dbBefore = (s) => (s ? (s.chat_server.db_load ?? 0) + (s.chat_server.usage ?? 0) : undefined);
const rows = [
  ['SPOKEN TURN (speak → reply starts playing)', summary.turn_total.median, previous?.turn_total.median],
  ['  1. Your speech → text   (stt)', summary.stt, previous?.stt],
  ['  2. Character replies    (chat → text)', summary.chat, previous?.chat],
  ['       model (Claude)', summary.chat_server.model, previous?.chat_server.model],
  ['       database before reply', dbBefore(summary), dbBefore(previous)],
  ['  3. Reply → speech       (voice ready)', summary.tts, previous && previous.tts + previous.download],
  ['OPENING LINE (tap Start → hear it)', summary.opener.total, previous?.opener.total],
];
console.log(`\n${'step'.padEnd(40)}${'median'.padStart(9)}${previous ? `${'previous'.padStart(11)}${'change'.padStart(10)}` : ''}`);
for (const [label, now, before] of rows) {
  const change = before ? `${now <= before ? '−' : '+'}${Math.abs(Math.round(((now - before) / before) * 100))}%` : '';
  console.log(`${label.padEnd(40)}${sec(now).padStart(9)}${previous ? `${sec(before).padStart(11)}${change.padStart(10)}` : ''}`);
}
console.log(`\nreply fully saved (glosses, gaps) after ${sec(summary.chat_done)} · the phone adds ~0.1 s to start a local clip`);
console.log(`worst turn ${sec(summary.turn_total.worst)} · reply length ~${summary.chat_server.output_tokens} output tokens · Mandarin retries ${summary.mandarin_retries}/${TURNS}`);

const file = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(join(dir, file), JSON.stringify({ date: new Date().toISOString(), turns: TURNS, summary, detail: turns }, null, 2));
console.log(`Saved perf/${file}${previousFile ? ` (compared with perf/${previousFile})` : ''}`);
