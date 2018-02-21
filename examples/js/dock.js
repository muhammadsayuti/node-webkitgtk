
const icons = [
  {
    path: '../icons/web-browser.svg',
    name: 'Web Browser',
    animation: true
  },
  {
    path: '../icons/visual-studio-code.svg',
    name: 'Visual Studio Code',
    animation: true
  },
  {
    path: '../icons/vlc.svg',
    name: 'VLC',
    animation: true
  },
  {
    path: '../icons/thunar.svg',
    name: 'Thunar',
    animation: true
  },
  {
    path: '../icons/obs.svg',
    name: 'OBS Studio',
    animation: true
  },
  {
    path: '../icons/telegram.svg',
    name: 'Telegram',
    animation: true
  },
  {
    path: '../icons/bittorent.svg',
    name: 'BitTorrent',
    animation: true
  },
  {
    path: '../icons/lutris.svg',
    name: 'Lutris',
    animation: true
  },
  {
    path: '../icons/spotify.svg',
    name: 'Spotify',
    animation: true
  }
];

const dock = new DockController({
  itemSize: 48,
  items: icons,
  radius: 10,
  position: 'bottom',
  padding: {
    top: 8,
    left: 5,
    right: 5,
    bottom: 8
  },
  itemPadding: {
    top: 0,
    bottom: 0,
    left: 5,
    right: 5
  }
});
// give gradient background to the dock
dock.setGradient({
  x1: 0,
  y1: 0,
  x2: 0,
  y2: dock.height,
  colorStops: {
    0: '#2B2B2B',
    1: '#515151'
  }
});
