const paddingTop = 5, paddingBottom = 5;
const paddingLeft = 5, paddingRight = 5;
const iconHeight = 48, iconWidth = 48;
const container = document.querySelector('#container');
const icons = [
  {
    path: '../icons/web-browser.svg',
    name: 'Web Browser'
  },
  {
    path: '../icons/visual-studio-code.svg',
    name: 'Visual Studio Code'
  },
  {
    path: '../icons/vlc.svg',
    name: 'VLC'
  },
  {
    path: '../icons/thunar.svg',
    name: 'Thunar'
  },
  {
    path: '../icons/obs.svg',
    name: 'OBS Studio'
  },
  {
    path: '../icons/telegram.png',
    name: 'Telegram'
  },
  {
    path: '../icons/bittorent.svg',
    name: 'BitTorrent'
  },
  {
    path: '../icons/lutris.svg',
    name: 'Lutris'
  },
  {
    path: '../icons/spotify.svg',
    name: 'Spotify'
  }
];
const dockWidth = ((iconWidth + paddingLeft + paddingRight) * icons.length) + (paddingRight) + (paddingLeft);
const dockHeight = iconWidth + paddingTop + paddingBottom;

var stage = new Konva.Stage({
  container: 'container',
  width: dockWidth,
  height: dockHeight
});
var layer = new Konva.Layer();
const dock =
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 100;
  });

const promises = icons.map((icon, i) => {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.src = icon.path;
    img.setAttribute('data-name', icon.name);
    img.onload = (e) => {
      resolve(img)
    };
    img.onerror = (e) => {
      console.log('loading image error', e);
      reject(e);
    };
  });
});

Promise.all(promises).then(images => {
  let lastX = 0, w = 0;
  let clickedTarget;
  images.forEach((img, i) => {
    let x = (i === 0) ? paddingLeft : (iconWidth * i) + (paddingLeft + paddingRight);
    if (i === 0) {
      x = paddingLeft + paddingRight;
      w += iconWidth + paddingLeft + paddingRight;
    } else {
      x = lastX + iconWidth + paddingRight + paddingLeft;
      w += iconWidth + paddingLeft + paddingRight;
    }
    lastX = x;
    const launcher = new Konva.Image({
      x,
      y: paddingTop,
      id: img.getAttribute('data-name'),
      image: img,
      width: iconWidth,
      height: iconHeight
    });
    var amplitude = 150;
    // in ms
    var period = 500;
    var centerX = stage.getWidth() / 2;
    const animationAttempt = 5;
    let currentAttempt = 0;

    launcher.on('click', (e) => {
      const el = e.target;
      clickedTarget = el;
      let anim = new Konva.Animation(function (frame) {
        // if () {

        // }
        console.log('animation running', el.attrs)
        el.setX(amplitude * Math.sin(frame.time * 2 * Math.PI / period) + centerX);
      }, layer);
      anim.start()
      setTimeout(() => {
        anim.stop();

      }, 5000);
    });
    layer.add(launcher);
  });
  stage.add(layer);
}).catch(err => console.error(err));
