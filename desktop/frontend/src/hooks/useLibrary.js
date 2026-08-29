import { useCallback, useEffect, useMemo, useState } from 'react';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function useLibrary() {
  const [songList, setSongList] = useState([]);
  const [currentFolder, setCurrentFolder] = useState('Cargando directorio...');
  const [searchQuery, setSearchQuery] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [playlists, setPlaylists] = useState({});
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/current_folder').then(response => response.json()),
      fetch('/api/songs').then(response => response.json()),
      fetch('/api/playlists').then(response => response.json()),
    ]).then(([folder, songs, lists]) => {
      if (folder.folder_path) setCurrentFolder(folder.folder_path);
      if (songs.songs) setSongList(songs.songs);
      if (lists.playlists) setPlaylists(lists.playlists);
    }).catch(console.error).finally(() => setIsLoading(false));
  }, []);

  const filteredList = useMemo(() => {
    const query = normalize(searchQuery);
    const paths = selectedPlaylist ? playlists[selectedPlaylist] : null;
    return songList.filter(song => {
      if (paths && !paths.includes(song.path)) return false;
      if ((song.rating || 0) < minRating) return false;
      return !query || ['title', 'artist', 'album', 'genre'].some(field => normalize(song[field]).includes(query));
    });
  }, [minRating, playlists, searchQuery, selectedPlaylist, songList]);

  const changeFolder = useCallback((folder) => {
    setCurrentFolder(folder);
    fetch('/api/songs').then(response => response.json()).then(data => {
      if (data.songs) setSongList(data.songs);
    }).catch(console.error);
  }, []);

  return { songList, setSongList, filteredList, currentFolder, searchQuery, setSearchQuery,
    minRating, setMinRating, isLoading, playlists, setPlaylists,
    selectedPlaylist, setSelectedPlaylist, changeFolder };
}
