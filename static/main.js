/* BloomBox Main JavaScript 🌸🎵 */
/* Handles: Audio Player, Search, Likes, Playlist Management, Petals */

// ============================================================
// GLOBAL STATE
// ============================================================
let queue = [];          // The current playback queue (array of song objects)
let currentIndex = -1;   // Index in queue
let shuffleOn = false;
let repeatOn = false;
let isDragging = false;

const audio = document.getElementById('main-audio');
const stickyPlayer = document.getElementById('sticky-player');
const playerCover = document.getElementById('player-cover');
const playerTitle = document.getElementById('player-title');
const playerDesc = document.getElementById('player-description');
const playerPlayBtn = document.getElementById('player-play');
const playerPrev = document.getElementById('player-prev');
const playerNext = document.getElementById('player-next');
const playerShuffle = document.getElementById('player-shuffle');
const playerRepeat = document.getElementById('player-repeat');
const playerLike = document.getElementById('player-like');
const progressSlider = document.getElementById('progress-slider');
const progressFill = document.getElementById('progress-fill');
const currentTimeEl = document.getElementById('player-current-time');
const totalTimeEl = document.getElementById('player-total-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');

// ============================================================
// FLOATING PETALS ANIMATION
// ============================================================
const PETAL_COLORS = [
  'rgba(255, 213, 205, 0.75)',
  'rgba(232, 219, 252, 0.7)',
  'rgba(212, 240, 240, 0.7)',
  'rgba(213, 232, 255, 0.7)',
  'rgba(255, 229, 217, 0.75)',
];

function createPetal() {
  const container = document.getElementById('petals-container');
  if (!container) return;
  const petal = document.createElement('div');
  petal.className = 'petal';
  const size = Math.random() * 10 + 8;
  const xPos = Math.random() * 100;
  const duration = Math.random() * 8 + 8;
  const delay = Math.random() * 5;
  const color = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
  const drift = (Math.random() - 0.5) * 120;
  petal.style.cssText = `
    left: ${xPos}vw;
    width: ${size}px;
    height: ${size}px;
    background: ${color};
    animation-duration: ${duration}s;
    animation-delay: ${delay}s;
    --drift: ${drift}px;
  `;
  container.appendChild(petal);
  setTimeout(() => {
    petal.remove();
  }, (duration + delay) * 1000 + 500);
}

function spawnPetals() {
  createPetal();
  // Reduce frequency a bit to stay subtle
  setTimeout(spawnPetals, Math.random() * 1200 + 600);
}

// Update keyframes to use CSS variable for drift
(function injectPetalKeyframe() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fall {
      0% { top: -60px; transform: translateX(0) rotate(-45deg) scale(0.7); opacity: 0; }
      10% { opacity: 0.85; }
      90% { opacity: 0.85; }
      100% { top: 105vh; transform: translateX(var(--drift, 100px)) rotate(315deg) scale(1.1); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();

// ============================================================
// AUDIO PLAYER ENGINE
// ============================================================
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateProgressUI() {
  if (!audio || isDragging) return;
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  if (progressSlider) progressSlider.value = pct;
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
  if (totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration);
}

function updatePlayBtnIcon(playing) {
  if (!playerPlayBtn) return;
  const icon = playerPlayBtn.querySelector('i');
  if (icon) {
    icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  }
}

function setVolume(val) {
  if (!audio) return;
  audio.volume = val / 100;
  if (!volumeIcon) return;
  if (val == 0) {
    volumeIcon.className = 'fa-solid fa-volume-xmark';
  } else if (val < 50) {
    volumeIcon.className = 'fa-solid fa-volume-low';
  } else {
    volumeIcon.className = 'fa-solid fa-volume-high';
  }
}

/**
 * Primary function to play a song.
 * @param {Object} song - { id, title, filepath, coverpath, description }
 * @param {Array}  songList - optional list of all songs in this context for queue
 */
function playSong(song, songList) {
  if (!audio) return;

  // Update queue
  if (songList && songList.length) {
    queue = songList;
    currentIndex = queue.findIndex(s => s.id === song.id);
    if (currentIndex === -1) {
      queue.unshift(song);
      currentIndex = 0;
    }
  } else {
    if (!queue.find(s => s.id === song.id)) {
      queue.push(song);
    }
    currentIndex = queue.findIndex(s => s.id === song.id);
  }

  // Update audio source
  const audioPath = `/static/uploads/${song.filepath}`;
  if (audio.src !== window.location.origin + audioPath) {
    audio.src = audioPath;
  }

  audio.play().catch(() => {});

  // Update player UI
  if (playerCover) {
    playerCover.src = `/static/uploads/${song.coverpath}`;
    playerCover.alt = song.title;
  }
  if (playerTitle) playerTitle.textContent = song.title;
  if (playerDesc) playerDesc.textContent = song.description || 'Enjoy your memories 🌸';
  updatePlayBtnIcon(true);

  // Show player
  if (stickyPlayer) stickyPlayer.classList.remove('hidden');

  // Update like button state
  updatePlayerLikeBtn(song.id);

  // Store currently playing id
  stickyPlayer.dataset.currentSongId = song.id;

  // Update all song card visual states
  highlightActiveSongCard(song.id);
}

function highlightActiveSongCard(songId) {
  document.querySelectorAll('.song-card').forEach(card => {
    card.classList.remove('playing');
  });
  const activeCard = document.querySelector(`.song-card[data-song-id="${songId}"]`);
  if (activeCard) activeCard.classList.add('playing');
}

function updatePlayerLikeBtn(songId) {
  if (!playerLike) return;
  const likedIds = window.LIKED_SONG_IDS || [];
  const isLiked = likedIds.includes(Number(songId));
  const icon = playerLike.querySelector('i');
  if (icon) {
    icon.className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  }
  playerLike.classList.toggle('liked', isLiked);
}

function playNext() {
  if (queue.length === 0) return;
  if (shuffleOn) {
    const indices = [...Array(queue.length).keys()].filter(i => i !== currentIndex);
    if (indices.length === 0) return;
    currentIndex = indices[Math.floor(Math.random() * indices.length)];
  } else {
    currentIndex = (currentIndex + 1) % queue.length;
  }
  playSong(queue[currentIndex]);
}

function playPrev() {
  if (queue.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  currentIndex = (currentIndex - 1 + queue.length) % queue.length;
  playSong(queue[currentIndex]);
}

// Audio event listeners
if (audio) {
  audio.addEventListener('timeupdate', updateProgressUI);

  audio.addEventListener('ended', () => {
    if (repeatOn) {
      audio.currentTime = 0;
      audio.play();
    } else {
      playNext();
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    if (totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration);
  });
}

// Player control buttons
if (playerPlayBtn) {
  playerPlayBtn.addEventListener('click', () => {
    if (!audio.src || audio.src === window.location.href) return;
    if (audio.paused) {
      audio.play();
      updatePlayBtnIcon(true);
    } else {
      audio.pause();
      updatePlayBtnIcon(false);
    }
  });
}

if (playerNext) playerNext.addEventListener('click', playNext);
if (playerPrev) playerPrev.addEventListener('click', playPrev);

if (playerShuffle) {
  playerShuffle.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    playerShuffle.classList.toggle('active', shuffleOn);
  });
}

if (playerRepeat) {
  playerRepeat.addEventListener('click', () => {
    repeatOn = !repeatOn;
    playerRepeat.classList.toggle('active', repeatOn);
  });
}

// Progress slider
if (progressSlider) {
  progressSlider.addEventListener('mousedown', () => { isDragging = true; });
  progressSlider.addEventListener('touchstart', () => { isDragging = true; });
  progressSlider.addEventListener('input', () => {
    const pct = progressSlider.value;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (audio.duration) {
      const secs = (pct / 100) * audio.duration;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(secs);
    }
  });
  progressSlider.addEventListener('change', () => {
    isDragging = false;
    if (audio.duration) {
      audio.currentTime = (progressSlider.value / 100) * audio.duration;
    }
  });
  progressSlider.addEventListener('mouseup', () => { isDragging = false; });
}

// Volume slider
if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    setVolume(volumeSlider.value);
  });
  setVolume(80); // Default
}

if (volumeIcon) {
  volumeIcon.addEventListener('click', () => {
    if (audio.volume > 0) {
      volumeIcon._prevVol = volumeSlider.value;
      volumeSlider.value = 0;
      setVolume(0);
    } else {
      const prev = volumeIcon._prevVol || 80;
      volumeSlider.value = prev;
      setVolume(prev);
    }
  });
}

// ============================================================
// MOBILE PLAYER EXPANSION
// ============================================================
function isMobile() {
  return window.innerWidth < 768;
}

if (stickyPlayer) {
  // Tap on song info or polaroid area on mobile to expand
  const songInfoEl = stickyPlayer.querySelector('.player-song-info');
  if (songInfoEl) {
    songInfoEl.addEventListener('click', () => {
      if (isMobile()) {
        stickyPlayer.classList.toggle('expanded');
        document.body.style.overflow = stickyPlayer.classList.contains('expanded') ? 'hidden' : '';
      }
    });
  }

  // Tap expanded player to collapse (but not controls)
  stickyPlayer.addEventListener('click', (e) => {
    if (isMobile() && stickyPlayer.classList.contains('expanded')) {
      const isControl = e.target.closest('.player-controls-container, .player-secondary-controls, .player-buttons, input');
      if (!isControl) {
        stickyPlayer.classList.remove('expanded');
        document.body.style.overflow = '';
      }
    }
  });

  // Swipe down to close on mobile
  let touchStartY = 0;
  stickyPlayer.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  stickyPlayer.addEventListener('touchmove', (e) => {
    if (!stickyPlayer.classList.contains('expanded')) return;
    const dy = e.touches[0].clientY - touchStartY;
    if (dy > 60) {
      stickyPlayer.classList.remove('expanded');
      document.body.style.overflow = '';
    }
  }, { passive: true });
}

// ============================================================
// LIKE / HEART BUTTON LOGIC
// ============================================================
function toggleLike(songId, btnEl) {
  fetch('/api/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song_id: Number(songId) })
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      // Not logged in — redirect to login
      window.location.href = '/login';
      return;
    }

    // Update the global liked ids list
    window.LIKED_SONG_IDS = window.LIKED_SONG_IDS || [];
    if (data.liked) {
      if (!window.LIKED_SONG_IDS.includes(Number(songId))) {
        window.LIKED_SONG_IDS.push(Number(songId));
      }
    } else {
      window.LIKED_SONG_IDS = window.LIKED_SONG_IDS.filter(id => id !== Number(songId));
    }

    // Update all heart buttons for this song across the page
    document.querySelectorAll(`.like-btn[data-song-id="${songId}"]`).forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = data.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
      }
      btn.classList.toggle('liked', data.liked);
    });

    // Update the player like button
    updatePlayerLikeBtn(songId);

    // If on liked page, remove the row if unliked
    if (!data.liked && document.body.dataset.page === 'liked') {
      const row = document.querySelector(`.song-row[data-song-id="${songId}"]`);
      if (row) {
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        row.style.transition = 'all 0.3s ease';
        setTimeout(() => row.remove(), 350);
      }
    }
  })
  .catch(() => {
    window.location.href = '/login';
  });
}

// Bind player like button
if (playerLike) {
  playerLike.addEventListener('click', () => {
    const songId = stickyPlayer ? stickyPlayer.dataset.currentSongId : null;
    if (songId) toggleLike(songId, playerLike);
  });
}

// ============================================================
// PLAYLIST MANAGEMENT (API Calls)
// ============================================================
function addSongToPlaylist(playlistId, songId, btnEl) {
  fetch('/api/playlist/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: Number(playlistId), song_id: Number(songId) })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      showToast('Song added to playlist! 🌸');
      if (btnEl) {
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnEl.disabled = true;
      }
    } else {
      showToast(data.error || 'Failed to add song');
    }
  })
  .catch(() => showToast('Failed to add song'));
}

function removeSongFromPlaylist(playlistId, songId, rowEl) {
  fetch('/api/playlist/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: Number(playlistId), song_id: Number(songId) })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      showToast('Song removed from playlist 🌸');
      if (rowEl) {
        rowEl.style.opacity = '0';
        rowEl.style.transition = 'opacity 0.3s ease';
        setTimeout(() => rowEl.remove(), 350);
      }
    }
  })
  .catch(() => showToast('Failed to remove song'));
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message) {
  const existing = document.getElementById('bb-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'bb-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text-main);
    color: white;
    font-family: var(--font-heading);
    font-size: 1rem;
    padding: 12px 24px;
    border-radius: 50px;
    z-index: 9999;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.2);
    animation: toastIn 0.3s ease forwards;
    white-space: nowrap;
  `;

  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(toastStyle);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

// ============================================================
// GLOBAL SEARCH DROPDOWN
// ============================================================
const searchInput = document.getElementById('global-search');
const searchDropdown = document.getElementById('search-results-dropdown');
let searchDebounce = null;

if (searchInput && searchDropdown) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();

    if (!q) {
      searchDropdown.classList.add('hidden');
      return;
    }

    searchDebounce = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => renderSearchResults(data))
        .catch(() => {});
    }, 250);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchDropdown.classList.add('hidden');
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchDropdown.classList.add('hidden');
    }
  });
}

function renderSearchResults(data) {
  if (!searchDropdown) return;
  const { songs, playlists } = data;

  if (!songs.length && !playlists.length) {
    searchDropdown.innerHTML = '<p class="no-results">No results found 🌸</p>';
    searchDropdown.classList.remove('hidden');
    return;
  }

  let html = '';

  if (songs.length) {
    html += `<div class="search-section">
      <div class="search-section-title">🎵 Songs</div>`;
    songs.forEach(s => {
      html += `
        <div class="search-item" onclick="playSong(${JSON.stringify(s).replace(/"/g, '&quot;')}, null); searchDropdown.classList.add('hidden');">
          <img class="search-item-img" src="/static/uploads/${s.coverpath}" alt="${s.title}" onerror="this.src='/static/images/logo.png'">
          <div class="search-item-info">
            <div class="search-item-title">${escHtml(s.title)}</div>
            <div class="search-item-desc">${escHtml((s.description || '').substring(0, 50))}…</div>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  if (playlists.length) {
    html += `<div class="search-section">
      <div class="search-section-title">🎶 Playlists</div>`;
    playlists.forEach(p => {
      html += `
        <div class="search-item" onclick="window.location.href='/playlist/${p.id}'">
          <div class="search-item-img" style="background:var(--lavender);display:flex;align-items:center;justify-content:center;border-radius:4px">
            <i class="fa-solid fa-compact-disc"></i>
          </div>
          <div class="search-item-info">
            <div class="search-item-title">${escHtml(p.name)}</div>
            <div class="search-item-desc">Playlist</div>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  searchDropdown.innerHTML = html;
  searchDropdown.classList.remove('hidden');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

// ============================================================
// SONG CARD CLICK SETUP (library and home pages)
// ============================================================
function initSongCards() {
  const songCards = document.querySelectorAll('.song-card');
  if (!songCards.length) return;

  // Collect all songs on page for queue
  const allSongs = [];
  songCards.forEach(card => {
    const song = {
      id: Number(card.dataset.songId),
      title: card.dataset.title,
      filepath: card.dataset.filepath,
      coverpath: card.dataset.coverpath,
      description: card.dataset.description || ''
    };
    allSongs.push(song);
  });

  songCards.forEach(card => {
    // Click on card body (not like button) to play
    card.addEventListener('click', (e) => {
      if (e.target.closest('.song-like-btn')) return;
      const song = {
        id: Number(card.dataset.songId),
        title: card.dataset.title,
        filepath: card.dataset.filepath,
        coverpath: card.dataset.coverpath,
        description: card.dataset.description || ''
      };
      playSong(song, allSongs);
    });
  });

  // Set up like buttons on cards
  document.querySelectorAll('.song-like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const songId = btn.dataset.songId;
      toggleLike(songId, btn);
    });
  });
}

// ============================================================
// SONG ROW CLICK SETUP (playlist detail & liked pages)
// ============================================================
function initSongRows() {
  const songRows = document.querySelectorAll('.song-row[data-song-id]');
  if (!songRows.length) return;

  const allSongs = [];
  songRows.forEach(row => {
    if (row.dataset.songId) {
      allSongs.push({
        id: Number(row.dataset.songId),
        title: row.dataset.title,
        filepath: row.dataset.filepath,
        coverpath: row.dataset.coverpath,
        description: row.dataset.description || ''
      });
    }
  });

  songRows.forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button, a, select')) return;
      const song = {
        id: Number(row.dataset.songId),
        title: row.dataset.title,
        filepath: row.dataset.filepath,
        coverpath: row.dataset.coverpath,
        description: row.dataset.description || ''
      };
      playSong(song, allSongs);
    });
  });

  // Like buttons in rows
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(btn.dataset.songId, btn);
    });
  });
}

// ============================================================
// PLAYLIST DETAIL PAGE CONTROLS
// ============================================================
function initPlaylistDetail() {
  const addSongSelect = document.getElementById('add-song-select');
  const addSongBtn = document.getElementById('add-song-btn');
  if (!addSongBtn || !addSongSelect) return;

  const playlistId = document.body.dataset.playlistId;

  addSongBtn.addEventListener('click', () => {
    const songId = addSongSelect.value;
    if (!songId) {
      showToast('Please select a song first! 🌸');
      return;
    }
    addSongToPlaylist(playlistId, songId, addSongBtn);
  });

  document.querySelectorAll('.remove-from-playlist-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const songId = btn.dataset.songId;
      const row = btn.closest('.song-row');
      removeSongFromPlaylist(playlistId, songId, row);
    });
  });
}

// ============================================================
// ADMIN DASHBOARD: Toggle inline replacement forms
// ============================================================
function initAdminPanel() {
  document.querySelectorAll('.toggle-replace-form').forEach(btn => {
    btn.addEventListener('click', () => {
      const songId = btn.dataset.songId;
      const form = document.getElementById(`replace-form-${songId}`);
      if (form) {
        form.classList.toggle('visible');
      }
    });
  });

  document.querySelectorAll('.toggle-edit-form').forEach(btn => {
    btn.addEventListener('click', () => {
      const songId = btn.dataset.songId;
      const form = document.getElementById(`edit-form-${songId}`);
      if (form) {
        form.classList.toggle('visible');
      }
    });
  });

  // File input label updates
  document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', () => {
      const label = input.parentElement.querySelector('.file-label-text');
      if (label && input.files.length) {
        label.textContent = input.files[0].name;
      }
    });
  });
}

// ============================================================
// FADE-IN ANIMATIONS (for cards & sections)
// ============================================================
function initFadeIn() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// Inject fade-in CSS
(function injectFadeInStyle() {
  const s = document.createElement('style');
  s.textContent = `
    .fade-in { opacity: 0; transform: translateY(18px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .fade-in.visible { opacity: 1; transform: translateY(0); }
    .song-card.playing .song-polaroid { box-shadow: 0 0 0 3px var(--pastel-pink-dark), var(--shadow-polaroid); }
  `;
  document.head.appendChild(s);
})();

// ============================================================
// AUTO-DISMISS FLASH MESSAGES
// ============================================================
function initFlashMessages() {
  document.querySelectorAll('.flash').forEach(msg => {
    setTimeout(() => {
      msg.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      msg.style.opacity = '0';
      msg.style.transform = 'translateY(-10px)';
      setTimeout(() => msg.remove(), 500);
    }, 4000);
  });
}

// ============================================================
// INITIALIZE ON DOM READY
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  spawnPetals();
  initSongCards();
  initSongRows();
  initPlaylistDetail();
  initAdminPanel();
  initFadeIn();
  initFlashMessages();
});
