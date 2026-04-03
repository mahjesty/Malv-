import { useEffect, useMemo, useRef, useState } from "react";

type UseAudioWaveformOptions = {
  barCount?: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
  updateHz?: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Audio-reactive waveform levels from the *real* mic stream.
 * Uses `AudioContext` + `AnalyserNode` (byte frequency data) and smooths levels to avoid jitter.
 */
export function useAudioWaveform(active: boolean, opts?: UseAudioWaveformOptions) {
  const barCount = opts?.barCount ?? 12;
  const fftSize = opts?.fftSize ?? 1024;
  const smoothingTimeConstant = opts?.smoothingTimeConstant ?? 0.85;
  const updateHz = opts?.updateHz ?? 30;

  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: barCount }, () => 0));
  const levelsRef = useRef<number[]>(levels);
  const rafRef = useRef<number | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

  const lastCommitAtRef = useRef(0);

  const derivedUpdateMs = useMemo(() => Math.max(16, Math.floor(1000 / updateHz)), [updateHz]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      setLevels(Array.from({ length: barCount }, () => 0));
      levelsRef.current = Array.from({ length: barCount }, () => 0);

      if (freqDataRef.current) freqDataRef.current = null;
      analyserRef.current = null;

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) track.stop();
      }
      mediaStreamRef.current = null;

      if (audioContextRef.current) {
        // Close releases the audio device/graph.
        void audioContextRef.current.close().catch(() => {
          /* noop */
        });
      }
      audioContextRef.current = null;
      return;
    }

    if (typeof navigator === "undefined" || typeof window === "undefined") return;

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        mediaStreamRef.current = stream;

        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = smoothingTimeConstant;
        analyserRef.current = analyser;

        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array;
        freqDataRef.current = freqData;

        const tick = () => {
          if (cancelled) return;
          const analyserNode = analyserRef.current;
          const data = freqDataRef.current;
          if (!analyserNode || !data) return;

          analyserNode.getByteFrequencyData(data as unknown as Uint8Array<ArrayBuffer>);

          // Map frequency bins -> barCount averaged levels.
          const bins = data.length;
          const binsPerBar = Math.max(1, Math.floor(bins / barCount));

          const next = new Array<number>(barCount);
          for (let i = 0; i < barCount; i++) {
            const start = i * binsPerBar;
            const end = Math.min(bins, start + binsPerBar);

            let sum = 0;
            let count = 0;
            for (let j = start; j < end; j++) {
              sum += data[j] ?? 0;
              count += 1;
            }

            const avg = count > 0 ? sum / count : 0;
            const raw = clamp01(avg / 255);
            // Gentle curve to make quiet speech visible without amplifying noise.
            next[i] = Math.pow(raw, 0.65);
          }

          // Smooth to avoid harsh jitter.
          const smoothed = levelsRef.current;
          for (let i = 0; i < barCount; i++) {
            const target = next[i] ?? 0;
            smoothed[i] = lerp(smoothed[i] ?? 0, target, 0.28);
            // Keep a floor so bars don't disappear instantly on low volume.
            smoothed[i] = Math.max(0, smoothed[i]);
          }

          const now = performance.now();
          if (now - lastCommitAtRef.current >= derivedUpdateMs) {
            lastCommitAtRef.current = now;
            // eslint-disable-next-line react/no-unstable-nested-components
            setLevels([...smoothed]);
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // If mic permission fails, fail silently (mic UI will show error).
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) track.stop();
      }
      mediaStreamRef.current = null;

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {
          /* noop */
        });
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      freqDataRef.current = null;
    };
  }, [
    active,
    barCount,
    fftSize,
    smoothingTimeConstant,
    derivedUpdateMs
  ]);

  return { levels };
}

