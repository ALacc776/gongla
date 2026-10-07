// Measures how long a spoken conversation turn takes against the deployed backend,
// step by step, and compares with the previous run.
//
//   node scripts/bench.mjs              # 5 turns
//   node scripts/bench.mjs --turns 8
//
// Each turn mimics the app: speech -> text (stt), reply (chat), reply -> speech
// (tts), then downloading the audio. Results are saved to perf/<timestamp>.json.
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

const opener = await call(token, 'session-start', { scenario_id: SCENARIO });
const openerTts = await call(token, 'tts', { text: opener.json.message.text_raw, voice: VOICE, rate: 0.85 });
const openerAudio = await download(openerTts.json.url);
const sessionId = opener.json.session_id;

const turns = [];
for (let i = 0; i < TURNS; i++) {
  const stt = await call(token, 'stt', recordings[i], true);
  const chat = await call(token, 'chat', { session_id: sessionId, text: stt.json.text || PHRASES[i] });
  const tts = await call(token, 'tts', { text: chat.json.message.text_raw, voice: VOICE, rate: 0.85 });
  const audio = await download(tts.json.url);
  const turn = {
    heard: stt.json.text,
    reply: chat.json.message.text_raw,
    stt_ms: stt.ms,
    chat_ms: chat.ms,
    tts_ms: tts.ms,
    tts_cached: tts.json.cached,
    download_ms: audio.ms,
    total_ms: stt.ms + chat.ms + tts.ms + audio.ms,
    server: { stt: stt.json.timings, chat: chat.json.timings, tts: tts.json.timings },
  };
  turns.push(turn);
  console.log(
    `turn ${i + 1}: ${(turn.total_ms / 1000).toFixed(1)}s  (heard "${turn.heard}", replied "${turn.reply}"${chat.json.timings?.model_calls > 1 ? ', Mandarin retry' : ''})`,
  );
}

await call(token, 'delete-account', {});

// ---- Summary ----
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const pick = (f) => turns.map(f).filter((v) => typeof v === 'number');
const sec = (ms) => (ms === undefined ? '   –' : `${(ms / 1000).toFixed(2)}s`);

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
  opener: {
    session_start: opener.ms,
    tts: openerTts.ms,
    download: openerAudio.ms,
    total: opener.ms + openerTts.ms + openerAudio.ms,
  },
  mandarin_retries: turns.filter((t) => t.server.chat?.model_calls > 1).length,
};

const dir = join(root, 'perf');
mkdirSync(dir, { recursive: true });
const previousFile = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1);
const previous = previousFile ? JSON.parse(readFileSync(join(dir, previousFile), 'utf8')).summary : null;

const rows = [
  ['SPOKEN TURN (speak → hear the reply)', summary.turn_total.median, previous?.turn_total.median],
  ['  1. Your speech → text   (stt)', summary.stt, previous?.stt],
  ['  2. Character replies    (chat)', summary.chat, previous?.chat],
  ['       model (Claude)', summary.chat_server.model, previous?.chat_server.model],
  ['       database + gaps', summary.chat_server.db_load + summary.chat_server.usage + summary.chat_server.gaps + summary.chat_server.save,
    previous && previous.chat_server.db_load + previous.chat_server.usage + previous.chat_server.gaps + previous.chat_server.save],
  ['       network + auth', summary.chat - summary.chat_server.total, previous && previous.chat - previous.chat_server.total],
  ['  3. Reply → speech       (tts)', summary.tts, previous?.tts],
  ['       Azure synthesis', summary.tts_server.azure, previous?.tts_server.azure],
  ['  4. Download the audio', summary.download, previous?.download],
  ['OPENING LINE (tap Start → hear it)', summary.opener.total, previous?.opener.total],
];
console.log(`\n${'step'.padEnd(40)}${'median'.padStart(9)}${previous ? `${'previous'.padStart(11)}${'change'.padStart(10)}` : ''}`);
for (const [label, now, before] of rows) {
  const change = before ? `${now <= before ? '−' : '+'}${Math.abs(Math.round(((now - before) / before) * 100))}%` : '';
  console.log(`${label.padEnd(40)}${sec(now).padStart(9)}${previous ? `${sec(before).padStart(11)}${change.padStart(10)}` : ''}`);
}
console.log(`\nworst turn ${sec(summary.turn_total.worst)} · reply length ~${summary.chat_server.output_tokens} output tokens · Mandarin retries ${summary.mandarin_retries}/${TURNS}`);

const file = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(join(dir, file), JSON.stringify({ date: new Date().toISOString(), turns: TURNS, summary, detail: turns }, null, 2));
console.log(`Saved perf/${file}${previousFile ? ` (compared with perf/${previousFile})` : ''}`);
