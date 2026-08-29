import { useEffect, useRef } from 'react';

export default function usePartyPlaybackSync({ enabled, currentSong, currentTime, duration, isPlaying, updatePlayback }) {
  const signatureRef = useRef('');
  useEffect(() => {
    if (!enabled) { signatureRef.current = ''; return; }
    const payload = { current: currentSong ? {
      song_id: currentSong.partyRequest?.song_id || currentSong.path,
      queue_item_id: currentSong.partyRequest?.id || null,
      title: currentSong.title, artist: currentSong.artist || '',
      requested_by: currentSong.partyRequest?.requested_by || null,
    } : null, position_ms: Math.round(currentTime * 1000), duration_ms: Math.round((duration || 0) * 1000), playing: isPlaying };
    const signature = JSON.stringify({ current: payload.current, playing: payload.playing, duration_ms: payload.duration_ms });
    const progressOnly = signatureRef.current === signature;
    signatureRef.current = signature;
    updatePlayback(payload, progressOnly);
  }, [currentSong, currentTime, duration, enabled, isPlaying, updatePlayback]);
}
