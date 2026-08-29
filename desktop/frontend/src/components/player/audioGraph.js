let audioContext = null;
let analyser = null;
let spectrumAnalyser = null;
let silentSpectrumGain = null;
let source = null;
let filters = [];
let connectedElement = null;

export function setEqGain(index, gain) {
  if (filters[index]) filters[index].gain.value = gain;
}

export function getOrCreateAnalyser(audioElement) {
  if (!audioElement) return null;

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (connectedElement !== audioElement) {
    try {
      source?.disconnect();
      source = audioContext.createMediaElementSource(audioElement);

      filters = [60, 230, 910, 4000, 14000].map(frequency => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });

      source.connect(filters[0]);
      for (let index = 0; index < filters.length - 1; index += 1) {
        filters[index].connect(filters[index + 1]);
      }

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      filters.at(-1).connect(analyser);
      analyser.connect(audioContext.destination);

      // A dedicated analysis branch gives the compact brand spectrum a much
      // wider useful range without changing the established main visualizer.
      spectrumAnalyser = audioContext.createAnalyser();
      spectrumAnalyser.fftSize = 256;
      spectrumAnalyser.minDecibels = -70;
      spectrumAnalyser.maxDecibels = -5;
      spectrumAnalyser.smoothingTimeConstant = 0.55;
      silentSpectrumGain = audioContext.createGain();
      silentSpectrumGain.gain.value = 0;
      filters.at(-1).connect(spectrumAnalyser);
      spectrumAnalyser.connect(silentSpectrumGain);
      silentSpectrumGain.connect(audioContext.destination);
      connectedElement = audioElement;
    } catch (error) {
      console.warn('VisualizerCard: could not connect audio source', error);
      return null;
    }
  }

  if (audioContext.state === 'suspended') audioContext.resume();
  return analyser;
}

export function getOrCreateSpectrumAnalyser(audioElement) {
  return getOrCreateAnalyser(audioElement) ? spectrumAnalyser : null;
}
