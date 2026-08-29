import { useCallback, useEffect, useRef, useState } from 'react';

export default function usePlayerController({ songList, filteredList, partyModeEnabled, dequeuePartySong }) {
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Number.parseFloat(localStorage.getItem('volume')) || 0.8);
  const audioRef = useRef(null);

  useEffect(() => { localStorage.setItem('volume', volume); }, [volume]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.volume = volume;
    const time = () => setCurrentTime(audio.currentTime);
    const metadata = () => setDuration(audio.duration);
    audio.addEventListener('timeupdate', time);
    audio.addEventListener('loadedmetadata', metadata);
    return () => { audio.removeEventListener('timeupdate', time); audio.removeEventListener('loadedmetadata', metadata); };
  }, [volume]);

  const playSongDirectly = useCallback((song) => {
    if (!audioRef.current || !song) return;
    setCurrentTime(0); setDuration(0); setCurrentSong(song);
    audioRef.current.src = `/api/stream?path=${encodeURIComponent(song.path)}`;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause(); setCurrentSong(null); setCurrentTime(0); setDuration(0); setIsPlaying(false);
  }, []);

  const advancePartyQueue = useCallback(async (itemId = null) => {
    const song = await dequeuePartySong(itemId);
    if (!song) { stop(); return false; }
    playSongDirectly(song); return true;
  }, [dequeuePartySong, playSongDirectly, stop]);

  const playNext = useCallback(() => {
    if (partyModeEnabled) { advancePartyQueue().catch(console.error); return; }
    if (isRepeat && !isShuffle) { if (currentSong) playSongDirectly(currentSong); return; }
    if (isShuffle) { if (filteredList.length) playSongDirectly(filteredList[Math.floor(Math.random() * filteredList.length)]); return; }
    const index = filteredList.findIndex(song => song.path === currentSong?.path);
    if (index >= 0 && index < filteredList.length - 1) { playSongDirectly(filteredList[index + 1]); return; }
    const libraryIndex = songList.findIndex(song => song.path === currentSong?.path);
    if (index === -1 && libraryIndex >= 0 && libraryIndex < songList.length - 1) playSongDirectly(songList[libraryIndex + 1]);
    else setIsPlaying(false);
  }, [advancePartyQueue, currentSong, filteredList, isRepeat, isShuffle, partyModeEnabled, playSongDirectly, songList]);

  const playPrev = useCallback(() => {
    const index = filteredList.findIndex(song => song.path === currentSong?.path);
    if (index > 0) { playSongDirectly(filteredList[index - 1]); return; }
    const libraryIndex = songList.findIndex(song => song.path === currentSong?.path);
    if (libraryIndex > 0) playSongDirectly(songList[libraryIndex - 1]);
  }, [currentSong, filteredList, playSongDirectly, songList]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause(); else audioRef.current.play().catch(console.error);
    setIsPlaying(value => !value);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const ended = () => playNext();
    audio.addEventListener('ended', ended);
    return () => audio.removeEventListener('ended', ended);
  }, [playNext]);

  return { audioRef, currentSong, setCurrentSong, isPlaying, setIsPlaying, isShuffle, setIsShuffle,
    isRepeat, setIsRepeat, currentTime, setCurrentTime, duration, volume, setVolume,
    playSongDirectly, advancePartyQueue, playNext, playPrev, togglePlay };
}
