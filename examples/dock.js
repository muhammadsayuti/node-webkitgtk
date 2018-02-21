const W = require('../');
const si = require('systeminformation');
const path = require('path');
const fs = require('fs');


si.graphics((data) => {
  const display = data.displays[0];
  // const container = W(() => {
  W.load('file://' + path.join(__dirname, './views/dock.html'), {
    offscreen: false,
    transparent: true,
    resizing: true,
    /**
     * By default, windows are decorated with a title bar, resize controls, etc. 
     * Some window managers allow GTK+ to disable these decorations, creating a borderless window. 
     * If you set the decorated property to FALSE, GTK+ will do its best to 
     * convince the window manager not to decorate the window. 
     */
    decorated: false,
    style: 'html,body {background-color:transparent !important;color:#FFF;}',
    window: {
      width: display.resolutionx,
      height: 20,
      // type of window
      type: W.WINDOW_TOPLEVEL,
      // the window type
      typeHint: W.WINDOW_TYPE_HINT_DOCK,
      // unique identifier for the window to be used when restoring a session
      role: "webkit-panel",
      /**
       * Windows may set a hint asking the desktop environment not to display 
       * the window in the pager. This function sets this hint. (A "pager" is 
       * any desktop navigation tool such as a workspace switcher that displays 
       * a thumbnail representation of the windows on the screen.).
       * 
       * TRUE to keep this window from appearing in the pager
       */
      skipPagerHint: true,
      position: {
        x: 0,
        y: display.resolutiony - 200
      }
    },
    // show: false,
    debug: true,
    console: true,
  }).once('ready', function () {
    this.show();
    this.run(({ display }, done) => {
      /**
       * Do initialization here and then dispatch event so the web process won't try to execute something 
       * that not yet initialized
       */
      window.display = display;
      window.dispatchEvent(new CustomEvent('ready'));
      done();
    }, { display });
  });
  // });
});
