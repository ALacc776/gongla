// Azure AI Speech (zh-HK) over REST. Keys stay on the server.

export const VOICES = ['zh-HK-HiuMaanNeural', 'zh-HK-HiuGaaiNeural', 'zh-HK-WanLungNeural'] as const;
export const DEFAULT_VOICE = 'zh-HK-HiuMaanNeural';

function config() {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) throw new Error('Speech is not set up yet (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION).');
  return { key, region };
}

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export type AudioFormat = 'mp3' | 'wav';

const OUTPUT_FORMATS: Record<AudioFormat, string> = {
  mp3: 'audio-24khz-48kbitrate-mono-mp3',
  wav: 'riff-16khz-16bit-mono-pcm',
};

export async function synthesize(text: string, voice: string, rate: number, format: AudioFormat): Promise<Uint8Array> {
  const { key, region } = config();
  const ssml = `<speak version="1.0" xml:lang="zh-HK"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMATS[format],
      'User-Agent': 'gong',
    },
    body: ssml,
  });
  if (!res.ok) {
    console.error('Azure TTS error', res.status, await res.text());
    throw new Error('The voice service failed. Try again.');
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Short-audio recognition: up to 60 s of 16 kHz mono WAV.
export async function recognize(wav: Uint8Array): Promise<string> {
  const { key, region } = config();
  const res = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-HK&format=simple`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        Accept: 'application/json',
      },
      body: wav,
    },
  );
  if (!res.ok) {
    console.error('Azure STT error', res.status, await res.text());
    throw new Error('The speech service failed. Try again.');
  }
  const json = await res.json();
  if (json.RecognitionStatus !== 'Success') return '';
  return (json.DisplayText ?? '').trim();
}
