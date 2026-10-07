import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { transcribe } from '@/lib/api';
import { setPlaybackMode, stopPlayback } from '@/lib/audio';
import { colors } from '@/lib/theme';

// 16 kHz mono 16-bit WAV: what Azure speech recognition expects.
const RECORDING: RecordingOptions = {
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
  onTranscript: (text: string, ms: number) => void;
  onListeningChange?: (listening: boolean) => void;
};

// F14: hold to talk, or tap to start and tap again to stop. Recording takes a moment
// to start (permission, switching the phone's audio mode), so a release that comes
// before it's ready is remembered instead of lost.
export function MicButton({ disabled, onTranscript, onListeningChange }: Props) {
  const recorder = useAudioRecorder(RECORDING);
  const [ui, setUi] = useState<Phase>('idle');
  const phase = useRef<Phase>('idle');
  const pressedAt = useRef(0);
  const recordingSince = useRef(0);
  const stopWhenReady = useRef(false);
  const tapMode = useRef(false);

  function setPhase(next: Phase) {
    phase.current = next;
    setUi(next);
    onListeningChange?.(next === 'recording');
  }

  async function start() {
    setPhase('starting');
    try {
      stopPlayback(); // the character stops talking when you start
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase('idle');
        Alert.alert('Microphone needed', 'Allow microphone access in Settings to talk to the character.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setPhase('idle');
      await setPlaybackMode().catch(() => {});
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
      await setPlaybackMode();
      if (stoppedAt - recordingSince.current < MIN_RECORDING_MS || !recorder.uri) return;
      const result = await transcribe(recorder.uri);
      if (result.text) onTranscript(result.text, Date.now() - stoppedAt);
      else Alert.alert("Didn't catch that", emptyReason(result));
    } catch (e) {
      Alert.alert("Couldn't hear that", (e as Error).message);
    } finally {
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
    stopWhenReady.current = false;
    tapMode.current = false;
    start();
  }

  function onPressOut() {
    if (phase.current !== 'starting' && phase.current !== 'recording') return;
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
      style={[styles.button, ui === 'recording' && styles.recording, disabled && styles.disabled]}
      accessibilityLabel={ui === 'recording' ? 'Stop and send' : 'Hold or tap to talk'}>
      {ui === 'stopping' ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        // "…" while the mic gets ready: start speaking when it turns ●.
        <Text style={styles.label}>{ui === 'recording' ? '●' : ui === 'starting' ? '…' : '🎙'}</Text>
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
  },
  recording: { transform: [{ scale: 1.15 }], backgroundColor: '#A12A22' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 20, color: '#FFFFFF' },
});
