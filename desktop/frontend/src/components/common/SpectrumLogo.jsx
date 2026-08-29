import { useEffect, useRef } from 'react';
import { getOrCreateSpectrumAnalyser } from '../player/audioGraph';

const BARS = [
  { x: 4.54, length: 3, orange: false },
  { x: 7.54, length: 9, orange: true },
  { x: 10.54, length: 15, orange: false },
  { x: 13.54, length: 9, orange: false },
  { x: 16.54, length: 3, orange: false },
  { x: 19.54, length: 9, orange: false },
];
const BAND_RANGES = [[0, 4], [3, 8], [7, 14], [13, 24], [23, 42], [41, 70]];
const CENTER_Y = 11.5;

function mixColor(from, to, amount) {
  const ratio = Math.max(0, Math.min(1, amount));
  const parse = value => [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16));
  const start = parse(from);
  const end = parse(to);
  return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * ratio)).join(',')})`;
}

function energyColor(energy) {
  const value = Math.max(0, Math.min(1, energy));
  if (value < 0.28) return mixColor('#fafafa', '#fff7cc', value / 0.28);
  if (value < 0.55) return mixColor('#fff7cc', '#fde047', (value - 0.28) / 0.27);
  if (value < 0.82) return mixColor('#fde047', '#f59e0b', (value - 0.55) / 0.27);
  return mixColor('#f59e0b', '#f06812', (value - 0.82) / 0.18);
}

export default function SpectrumLogo({ isPlaying, size = 50 }) {
  const pathsRef = useRef([]);
  const smoothedRef = useRef(BARS.map(() => 0));
  const rangesRef = useRef(BARS.map(() => null));

  useEffect(() => {
    let frame = 0;
    let lastFrameAt = 0;
    const paths = pathsRef.current;

    const restore = () => {
      smoothedRef.current.fill(0);
      rangesRef.current.fill(null);
      paths.forEach((path, index) => {
        if (!path) return;
        const bar = BARS[index];
        const half = bar.length / 2;
        path.setAttribute('d', `M ${bar.x},${CENTER_Y - half} V ${CENTER_Y + half}`);
        path.style.stroke = bar.orange ? '#f06812' : '#fafafa';
        path.style.strokeWidth = '1.7px';
        path.style.filter = '';
        path.style.opacity = bar.orange ? '1' : '0.9';
      });
    };

    restore();
    if (!isPlaying || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return restore;

    const audioElement = document.getElementById('audio-player');
    const analyser = getOrCreateSpectrumAnalyser(audioElement);
    if (!analyser) return restore;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const animate = timestamp => {
      frame = window.requestAnimationFrame(animate);
      if (document.hidden || timestamp - lastFrameAt < 28) return;
      lastFrameAt = timestamp;
      analyser.getByteFrequencyData(frequencyData);
      paths.forEach((path, index) => {
        if (!path) return;
        const [start, requestedEnd] = BAND_RANGES[index];
        const end = Math.min(requestedEnd, frequencyData.length);
        let total = 0;
        for (let bin = start; bin < end; bin += 1) total += frequencyData[bin];
        const level = end > start ? (total / (end - start)) / 255 : 0;
        let range = rangesRef.current[index];
        if (!range) {
          range = { floor: Math.max(0, level - 0.09), peak: Math.min(1, level + 0.09) };
          rangesRef.current[index] = range;
        }
        // Fast adaptation when a genuine new low/high appears; very slow drift
        // otherwise. This preserves contrast across differently mastered songs.
        range.floor += (level - range.floor) * (level < range.floor ? 0.12 : 0.0015);
        const minimumPeak = Math.min(1, range.floor + 0.14);
        const peakTarget = Math.max(level, minimumPeak);
        range.peak += (peakTarget - range.peak) * (level > range.peak ? 0.18 : 0.003);
        const dynamicRange = Math.max(0.12, range.peak - range.floor);
        const raw = Math.max(0, Math.min(1, (level - range.floor) / dynamicRange));
        const previous = smoothedRef.current[index];
        const energy = previous + (raw - previous) * (raw > previous ? 0.38 : 0.22);
        smoothedRef.current[index] = energy;

        const bar = BARS[index];
        const heightScale = 0.78 + energy * 0.47;
        const half = (bar.length * heightScale) / 2;
        const widthScale = 0.95 + energy * 0.1;
        const colorEnergy = energy ** 1.35;
        path.setAttribute('d', `M ${bar.x},${CENTER_Y - half} V ${CENTER_Y + half}`);
        path.style.stroke = energyColor(colorEnergy);
        path.style.strokeWidth = `${1.7 * widthScale}px`;
        path.style.opacity = String(0.88 + energy * 0.12);
        path.style.filter = colorEnergy > 0.84 ? `drop-shadow(0 0 ${2 + colorEnergy * 3}px rgba(240,104,18,.72))` : '';
      });
    };

    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      restore();
    };
  }, [isPlaying]);

  return (
    <svg className="brand-logo-svg spectrum-logo" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {BARS.map((bar, index) => {
        const half = bar.length / 2;
        return <path
          key={bar.x}
          ref={element => { pathsRef.current[index] = element; }}
          className={`brand-bar ${bar.orange ? 'orange-bar' : ''}`}
          d={`M ${bar.x},${CENTER_Y - half} V ${CENTER_Y + half}`}
          stroke={bar.orange ? '#f06812' : '#fafafa'}
          strokeWidth="1.7"
          strokeLinecap="round"
        />;
      })}
    </svg>
  );
}
