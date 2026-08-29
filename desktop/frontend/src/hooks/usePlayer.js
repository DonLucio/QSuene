import { useCallback, useEffect, useRef, useState } from 'react';

export default function usePlayer({ filteredList, songList, partyModeEnabled, dequeuePartySong }) {
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = Number.parseFloat(localStorage.getItem('volume'));
    return Number.isNaN(saved) ? 0.8 : saved;
  });
  const audioRef = useRef(null);

  useEffect(() => { localStorage.setItem('volume', volume); }, [volume]);

  const playSongDirectly = useCallback((song) => {
    if (!audioRef.current || !song) return;
    setCurrentSong(song);
    audioRef.current.src = `/api/stream?path=${encodeURIComponent(song.path)}`;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const playNext = useCallback(() => {
    if (isRepeat && !isShuffle) {
      if (currentSong) playSongDirectly(currentSong);
      return;
    }

    if (isShuffle) {
      if (filteredList.length > 0) {
        playSongDirectly(filteredList[Math.floor(Math.random() * filteredList.length)]);
      }
      return;
    }

    const filteredIndex = filteredList.findIndex(song => song.path === currentSong?.path);
    if (filteredIndex !== -1 && filteredIndex < filteredList.length - 1) {
      playSongDirectly(filteredList[filteredIndex + 1]);
      return;
    }

    if (filteredIndex === -1) {
      const libraryIndex = songList.findIndex(song => song.path === currentSong?.path);
      if (libraryIndex !== -1 && libraryIndex < songList.length - 1) {
        playSongDirectly(songList[libraryIndex + 1]);
        return;
      }
    }
    setIsPlaying(false);
  }, [currentSong, filteredList, isRepeat, isShuffle, playSongDirectly, songList]);

  const playPrev = useCallback(() => {
    const filteredIndex = filteredList.findIndex(song => song.path === currentSong?.path);
    if (filteredIndex > 0) {
      playSongDirectly(filteredList[filteredIndex - 1]);
      return;
    }
    const libraryIndex = songList.findIndex(song => song.path === currentSong?.path);
    if (libraryIndex > 0) playSongDirectly(songList[libraryIndex - 1]);
  }, [currentSong, filteredList, playSongDirectly, songList]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(console.error);
    setIsPlaying(playing => !playing);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleEnded = async () => {
      if (partyModeEnabled) {
        try {
          const queuedSong = await dequeuePartySong();
          if (queuedSong) {
            playSongDirectly(queuedSong);
            return;
          }
        } catch (error) {
          console.error('No se pudo obtener la siguiente canción de la fiesta', error);
        }
      }
      playNext();
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [dequeuePartySong, partyModeEnabled, playNext, playSongDirectly]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.volume = volume;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [volume]);

  return {
    audioRef,
    currentSong,
    setCurrentSong,
    isPlaying,
    setIsPlaying,
    isShuffle,
    setIsShuffle,
    isRepeat,
    setIsRepeat,
    currentTime,
    setCurrentTime,
    duration,
    volume,
    setVolume,
    playSongDirectly,
    playNext,
    playPrev,
    togglePlay,
  };
}
