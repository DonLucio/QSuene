import { useCallback, useEffect } from 'react';

export default function usePartyQueue({ enabled, queue, currentSong, isPlaying, advance, enqueue, playDirectly }) {
  useEffect(() => {
    if (enabled && !isPlaying && !currentSong && queue.length) advance().catch(console.error);
  }, [advance, currentSong, enabled, isPlaying, queue]);
  const playItem = useCallback(item => advance(item.id), [advance]);
  const playLibrarySong = useCallback(song => enabled ? enqueue(song) : playDirectly(song), [enabled, enqueue, playDirectly]);
  return { playItem, playLibrarySong };
}
