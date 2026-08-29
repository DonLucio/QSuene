import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getOrCreateAnalyser, setEqGain } from './audioGraph';

const MODES = [
  { id: 'bars',   label: 'Barras' },
  { id: 'mirror', label: 'Espejo' },
  { id: 'wave',   label: 'Onda' },
  { id: 'line',   label: 'Espectro' },
  { id: 'radial', label: 'Radial' },
  { id: 'vu',     label: 'VU Meter' },
];

function VisualizerCard({ isPlaying, currentSong }) {
  const hasSong = !!currentSong;
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);

  const [mode, setMode] = useState(() => localStorage.getItem('visMode') || 'bars');
  const [showEq, setShowEq] = useState(false);
  const [eqGains, setEqGains] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eqGains')) || [0, 0, 0, 0, 0]; }
    catch { return [0, 0, 0, 0, 0]; }
  });
  const [status, setStatus] = useState('idle');

  useEffect(() => { localStorage.setItem('visMode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('eqGains', JSON.stringify(eqGains)); }, [eqGains]);

  const connectAudio = useCallback(() => {
    const audioEl = document.getElementById('audio-player');
    if (!audioEl) return false;
    const analyser = getOrCreateAnalyser(audioEl);
    if (!analyser) return false;
    analyserRef.current = analyser;
    eqGains.forEach((gain, idx) => setEqGain(idx, gain));
    return true;
  }, [eqGains]);

  // Drawing loop
  const draw = useCallback(function drawFrame() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const bufLen = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufLen);
    const timeData = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    ctx.clearRect(0, 0, W, H);

    const PRIMARY = '#f97316';   // orange
    const CYAN = '#06b6d4';

    if (mode === 'bars') {
      const barW = (W / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (freqData[i] / 255) * H * 0.88;
        const hue = 20 + (freqData[i] / 255) * 30;
        ctx.fillStyle = `hsl(${hue}, 95%, 55%)`;
        ctx.fillRect(x, H - barH, barW - 1, barH);
        x += barW + 0.5;
        if (x > W) break;
      }
    }
    else if (mode === 'mirror') {
      const barW = (W / bufLen) * 2.5;
      let x = 0;
      const mid = H / 2;
      for (let i = 0; i < bufLen; i++) {
        const barH = (freqData[i] / 255) * mid * 0.9;
        ctx.fillStyle = PRIMARY;
        ctx.globalAlpha = 0.7 + (freqData[i] / 255) * 0.3;
        ctx.fillRect(x, mid - barH, barW - 1, barH);
        ctx.fillRect(x, mid, barW - 1, barH);
        x += barW + 0.5;
        if (x > W) break;
      }
      ctx.globalAlpha = 1;
    }
    else if (mode === 'wave') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = PRIMARY;
      ctx.shadowColor = PRIMARY;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const sliceW = W / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * H) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    else if (mode === 'line') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const sliceW = W / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const y = H - (freqData[i] / 255) * H * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.stroke();

      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(6,182,212,0.25)');
      grad.addColorStop(1, 'rgba(6,182,212,0.02)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    else if (mode === 'radial') {
      const cx = W / 2, cy = H / 2;
      const radius = Math.min(cx, cy) * 0.35;
      const bars = Math.min(bufLen, 80);
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const amp = (freqData[i] / 255) * radius * 1.4;
        const x1 = cx + Math.cos(angle) * radius;
        const y1 = cy + Math.sin(angle) * radius;
        const x2 = cx + Math.cos(angle) * (radius + amp);
        const y2 = cy + Math.sin(angle) * (radius + amp);
        const hue = 20 + (i / bars) * 30;
        ctx.strokeStyle = `hsl(${hue}, 95%, 60%)`;
        ctx.lineWidth = 2;
        ctx.shadowColor = PRIMARY;
        ctx.shadowBlur = amp > 5 ? 6 : 0;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(249,115,22,0.25)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    else if (mode === 'vu') {
      const labelW = 20;
      const barH = Math.floor(H * 0.12);
      const gap = 4;
      const avgFreq = freqData.slice(0, 64).reduce((a, b) => a + b, 0) / 64;
      const val = avgFreq / 255;

      ['L', 'R'].forEach((ch, idx) => {
        const y = idx === 0 ? H * 0.3 : H * 0.55;
        const barMaxW = W - labelW - 8;
        const segments = 30;
        const filled = Math.round(val * segments);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold 11px monospace`;
        ctx.fillText(ch, 4, y + barH - 2);

        for (let s = 0; s < segments; s++) {
          const sx = labelW + s * ((barMaxW - gap * (segments - 1)) / segments + gap / segments);
          const sw = (barMaxW - gap * (segments - 1)) / segments;
          if (s < filled) {
            const hue = s < segments * 0.7 ? 20 + s * 1.5 : 0;
            const light = s < segments * 0.7 ? 55 : 50;
            ctx.fillStyle = `hsl(${hue}, 95%, ${light}%)`;
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
          }
          ctx.fillRect(sx, y, sw, barH);
        }
      });
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [mode]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(() => {
        const ok = connectAudio();
        setStatus(ok ? 'active' : 'error');
        if (ok || analyserRef.current) rafRef.current = requestAnimationFrame(draw);
      });
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, draw, connectAudio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const handleNextMode = () => {
    const currentIndex = MODES.findIndex(m => m.id === mode);
    const nextIndex = (currentIndex + 1) % MODES.length;
    setMode(MODES[nextIndex].id);
  };

  const handleEqChange = (idx, value) => {
    const newGains = [...eqGains];
    newGains[idx] = value;
    setEqGains(newGains);
    setEqGain(idx, value);
  };

  return (
    <div className="visualizer-card">
      {/* Title + Mode selector pills + EQ button */}
      <div className="vis-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="fa-solid fa-wave-square" style={{ color: 'var(--primary)' }}></i>
          <span>Visualizador</span>
        </div>

        {/* Mode Selector Pills */}
        <div className="vis-mode-pills">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`vis-pill ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
              title={`Ver modo ${m.label}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Toggle EQ */}
        <button
          className={`vis-eq-btn ${showEq ? 'active' : ''}`}
          onClick={() => setShowEq(!showEq)}
          title="Alternar Ecualizador"
        >
          <i className="fa-solid fa-sliders"></i> {showEq ? "Ocultar EQ" : "EQ"}
        </button>
      </div>

      {/* Canvas Wrapper — clicking cycles mode */}
      <div className="vis-canvas-wrapper" onClick={handleNextMode} title="Clic para cambiar modo de espectro">
        <canvas ref={canvasRef} className="visualizer-canvas"></canvas>

        {/* Overlay 1: No song loaded */}
        {!hasSong && status !== 'error' && (
          <div className="vis-overlay">
            <i className="fa-solid fa-compact-disc"></i>
            <span>Selecciona una canción para activar el visualizador</span>
          </div>
        )}

        {/* Overlay 2: Paused */}
        {hasSong && !isPlaying && status !== 'error' && (
          <div className="vis-overlay vis-overlay--paused">
            <span>En pausa</span>
          </div>
        )}

        {/* Overlay 3: Error */}
        {status === 'error' && (
          <div className="vis-overlay vis-overlay--error" onClick={e => e.stopPropagation()}>
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>No se pudo iniciar el visualizador</span>
            <button onClick={connectAudio} className="vis-retry-btn">Reintentar</button>
          </div>
        )}
      </div>

      {/* Equalizer Overlay Container */}
      {showEq && (
        <div className="equalizer-container">
          {[
            { label: '60Hz', idx: 0 },
            { label: '230Hz', idx: 1 },
            { label: '910Hz', idx: 2 },
            { label: '4kHz', idx: 3 },
            { label: '14kHz', idx: 4 }
          ].map((band) => (
            <div className="eq-slider-group" key={band.idx}>
              <label>{band.label}</label>
              <input 
                type="range" min="-12" max="12" step="1" 
                value={eqGains[band.idx]}
                onChange={(e) => handleEqChange(band.idx, parseInt(e.target.value))} 
              />
              <span className="eq-value">{eqGains[band.idx] > 0 ? `+${eqGains[band.idx]}` : eqGains[band.idx]}dB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VisualizerCard;
