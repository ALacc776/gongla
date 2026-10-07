import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { transcribe } from '@/lib/api';
import { setPlaybackMode } from '@/lib/audio';
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

// onTranscript gets how long recognition took after the button was released, in ms.
type Props = { disabled?: boolean; onTranscript: (text: string, ms: number) => void };

// F14: hold to talk. The transcript goes into the text box for the learner to
// check before sending, because recognition of learner Cantonese is error-prone.
export function MicButton({ disabled, onTranscript }: Props) {
  const recorder = useAudioRecorder(RECORDING);
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const [startedAt, setStartedAt] = useState(0);

  async function start() {
    if (state !== 'idle') return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Allow microphone access in Settings to talk to the character.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStartedAt(Date.now());
    setState('recording');
  }

  async function stop() {
    if (state !== 'recording') return;
    const released = Date.now();
    setState('working');
    try {
      await recorder.stop();
      await setPlaybackMode();
      if (Date.now() - startedAt < MIN_RECORDING_MS || !recorder.uri) {
        setState('idle');
        return;
      }
      const { text } = await transcribe(recorder.uri);
      if (text) onTranscript(text, Date.now() - released);
      else Alert.alert("Didn't catch that", 'Try again a little closer to the mic.');
    } catch (e) {
      Alert.alert("Couldn't hear that", (e as Error).message);
    } finally {
      setState('idle');
    }
  }

  return (
    <Pressable
      disabled={disabled || state === 'working'}
      onPressIn={start}
      onPressOut={stop}
      style={[styles.button, state === 'recording' && styles.recording, disabled && styles.disabled]}
      accessibilityLabel="Hold to talk">
      {state === 'working' ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.label}>{state === 'recording' ? '●' : '🎙'}</Text>
      )}
    </Pressable>
  );
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
