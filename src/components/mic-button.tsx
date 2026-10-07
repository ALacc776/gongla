import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { transcribe } from '@/lib/api';
import { setRecordReady, stopPlayback } from '@/lib/audio';
import { colors } from '@/lib/theme';

// 16 kHz mono 16-bit WAV: what Azure speech recognition expects.
const RECORDING: RecordingOptions = {
  // Live input level, shown on the button and reported if nothing is recognised.
  isMeteringEnabled: true,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: { outputFormat: 'default', audioEncoder: 'default' },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

const MIN_RECORDING_MS = 400;
// People let go a moment before they finish the last syllable.
const TAIL_MS = 300;
// A press shorter than this is a tap: recording keeps going until the next tap.
const TAP_MS = 350;

type Phase = 'idle' | 'starting' | 'recording' | 'stopping';

// onTranscript gets how long recognition took after recording stopped, in ms.
type Props = {
  disabled?: boolean;
  // Kept mounted (so the mic stays ready) but not shown, e.g. while typing.
  hidden?: boolean;
  onTranscript: (text: string, ms: number) => void;
  onListeningChange?: (listening: boolean) => void;
};

// F14: hold to talk, or tap to start and tap again to stop. Recording takes a moment
// to start (permission, switching the phone's audio mode), so a release that comes
// before it's ready is remembered instead of lost.
export function MicButton({ disabled, hidden, onTranscript, onListeningChange }: Props) {
  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [ui, setUi] = useState<Phase>('idle');
  // Loudest input level (dBFS, -160 to 0) during the current recording.
  const loudestDb = useRef(-160);
  const releasedAt = useRef(0);
  const level = ui === 'recording' && recorderState.metering !== undefined ? recorderState.metering : -160;
  useEffect(() => {
    if (ui === 'recording') loudestDb.current = Math.max(loudestDb.current, level);
  }, [ui, level]);
  const phase = useRef<Phase>('idle');
  const pressedAt = useRef(0);
  const recordingSince = useRef(0);
  const stopWhenReady = useRef(false);
  const tapMode = useRef(false);
  // The recorder is prepared ahead of time so pressing the button records at once.
  const prepared = useRef<Promise<boolean> | null>(null);

  function prepare() {
    prepared.current = recorder
      .prepareToRecordAsync()
      .then(() => true)
      .catch((e) => {
        console.warn('mic prepare failed', e);
        return false;
      });
    return prepared.current;
  }

  // Chat open: if the mic is already allowed, get it ready. Chat closed: mic off.
  useEffect(() => {
    let cancelled = false;
    getRecordingPermissionsAsync().then(async ({ granted }) => {
      if (!granted || cancelled) return;
      await setRecordReady(true);
      if (!cancelled) prepare();
    });
    return () => {
      cancelled = true;
      setRecordReady(false).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPhase(next: Phase) {
    phase.current = next;
    setUi(next);
    onListeningChange?.(next === 'recording');
  }

  async function start() {
    setPhase('starting');
    try {
      stopPlayback(); // the character stops talking when you start
      let ready = prepared.current ? await prepared.current : false;
      if (!ready) {
        // First time (or preparing failed): ask for the mic and get ready now.
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setPhase('idle');
          Alert.alert('Microphone needed', 'Allow microphone access in Settings to talk to the character.');
          return;
        }
        await setRecordReady(true);
        ready = await prepare();
        if (!ready) throw new Error('The microphone could not start.');
      }
      prepared.current = null;
      recorder.record();
      loudestDb.current = -160;
    } catch (e) {
      setPhase('idle');
      prepare();
      Alert.alert("Couldn't start the microphone", (e as Error).message);
      return;
    }
    recordingSince.current = Date.now();
    setPhase('recording');
    if (stopWhenReady.current) stop();
  }

  async function stop() {
    if (phase.current !== 'recording') return;
    setPhase('stopping');
    await new Promise((r) => setTimeout(r, TAIL_MS));
    const stoppedAt = Date.now();
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (stoppedAt - recordingSince.current < MIN_RECORDING_MS || !uri) return;
      const result = await transcribe(uri);
      if (result.text) onTranscript(result.text, Date.now() - stoppedAt);
      else {
        let kb = '?';
        try {
          kb = String(Math.round((new File(uri).size ?? 0) / 1024));
        } catch {}
        const ready = ((recordingSince.current - pressedAt.current) / 1000).toFixed(1);
        const held = (((releasedAt.current || stoppedAt) - pressedAt.current) / 1000).toFixed(1);
        const details = `Mic ready after ${ready}s · held ${held}s · recorded ${result.seconds}s · ${kb} KB · level ${Math.round(loudestDb.current)} dB · loudness ${result.peak} · Azure ${result.status}`;
        Alert.alert("Didn't catch that", `${emptyReason(result)}\n\n${details}`);
      }
    } catch (e) {
      Alert.alert("Couldn't hear that", (e as Error).message);
    } finally {
      // Ready for the next turn. Only now: preparing reuses (and empties) the same file.
      prepare();
      setPhase('idle');
    }
  }

  function onPressIn() {
    if (phase.current === 'recording' && tapMode.current) {
      stop(); // second tap
      return;
    }
    if (phase.current !== 'idle') return;
    pressedAt.current = Date.now();
    releasedAt.current = 0;
    stopWhenReady.current = false;
    tapMode.current = false;
    start();
  }

  function onPressOut() {
    if (phase.current !== 'starting' && phase.current !== 'recording') return;
    releasedAt.current = Date.now();
    if (tapMode.current) return;
    if (Date.now() - pressedAt.current < TAP_MS) {
      tapMode.current = true; // a tap: keep listening until the next tap
      return;
    }
    if (phase.current === 'recording') stop();
    else stopWhenReady.current = true; // let go before it was ready
  }

  return (
    <Pressable
      disabled={disabled || ui === 'stopping'}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.button, ui === 'recording' && styles.recording, disabled && styles.disabled, hidden && styles.hidden]}
      accessibilityLabel={ui === 'recording' ? 'Stop and send' : 'Hold or tap to talk'}>
      {ui === 'stopping' ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        // "…" while the mic gets ready: start speaking when it turns ●.
        <Text style={styles.label}>{ui === 'recording' ? '●' : ui === 'starting' ? '…' : '🎙'}</Text>
      )}
      {ui === 'recording' && (
        // How loud the mic is hearing you: -60 dB (nothing) to 0 dB (very loud).
        <View style={[styles.level, { height: `${Math.max(0, Math.min(1, (level + 60) / 60)) * 100}%` }]} />
      )}
    </Pressable>
  );
}

// Why nothing was recognised, from what the server measured in the recording.
function emptyReason({ status, seconds, peak }: { status: string; seconds: number; peak: number }) {
  if (peak < 0.01) {
    return 'The recording was silent. Check that Expo Go is allowed to use the microphone (iPhone Settings → Expo Go), and start speaking once the button turns ●.';
  }
  if (seconds < 1) return 'That was very short. Start speaking once the button turns ●, and let go when you finish.';
  if (peak < 0.1 || status === 'InitialSilenceTimeout') {
    return 'It was very quiet. Hold the phone closer and speak up a little.';
  }
  return `It heard you but couldn't make out the words (${seconds}s, ${status}). Try again a little slower, or type it.`;
}

const styles = StyleSheet.create({
  button: {
    width: 64,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recording: { transform: [{ scale: 1.15 }], backgroundColor: '#A12A22' },
  disabled: { opacity: 0.4 },
  hidden: { display: 'none' },
  label: { fontSize: 20, color: '#FFFFFF' },
  level: { position: 'absolute', left: 0, bottom: 0, width: 6, backgroundColor: '#FFFFFF', opacity: 0.8, borderRadius: 3 },
});
