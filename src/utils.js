

module.exports.defineConstants = function defineConstants(obj) {
  Object.defineProperties(obj, {
    WINDOW_POPUP: {
      value: 0
    },
    // toplevel window (used to implement GtkWindow)
    WINDOW_TOPLEVEL: {
      value: 1
    },
    /**
     * this window has no parent, covers the entire screen, 
     * and is created by the window system
     */
    WINDOW_ROOT: {
      value: 2
    },
    // child window (used to implement e.g. GtkEntry)
    WINDOW_CHILD: {
      value: 3
    },
    // override redirect temporary window (used to implement GtkMenu)
    WINDOW_TEMP: {
      value: 4
    },
    WINDOW_FOREIGN: {
      value: 5
    },
    WINDOW_OFFSCREEN: {
      value: 6
    },
    /**
     * subsurface-based window; This window is visually tied to a toplevel, 
     * and is moved/stacked with it. Currently this window type is only 
     * implemented in Wayland. Since 3.14
     */
    WINDOW_SUBSURFACE: {
      value: 7
    },
    /**
     * Used for creating the desktop background window.
     * your window will be hinted as desktop to window manager
     * it will always stick on the desktop.
     * you cannot use keepAbove option in this mode, because 
     * it won't take any effect
     */
    WINDOW_TYPE_HINT_DESKTOP: {
      value: 0
    },
    /**
     * Used for creating dock or panel windows.
     * your window will be hinted as dock or panel to window manager
     * but there's some disadvantage for example you cannot 
     * listen onblur event to know if the window have focus or not
     */
    WINDOW_TYPE_HINT_DOCK: {
      value: 1
    },
    // Window used to implement toolbars.
    WINDOW_TYPE_HINT_TOOLBAR: {
      value: 2
    },
    /**
     * Window used to implement a menu; GTK+ uses this hint 
     * only for torn-off menus, see GtkTearoffMenuItem.
     */
    WINDOW_TYPE_HINT_MENU: {
      value: 3
    },
    //Utility windows which are not detached toolbars or dialogs.
    WINDOW_TYPE_HINT_UTILITY: {
      value: 4
    },
    // Window used to display a splash screen during application startup.
    WINDOW_TYPE_HINT_SPLASH: {
      value: 5
    },
    // Dialog window.
    WINDOW_TYPE_HINT_DIALOG: {
      value: 6
    },
    // A menu that belongs to a menubar.
    WINDOW_TYPE_HINT_DROPDOWN_MENU: {
      value: 7
    },
    // A menu that does not belong to a menubar, e.g. a context menu.
    WINDOW_TYPE_HINT_POPUP_MENU: {
      value: 8
    },
    // A tooltip.
    WINDOW_TYPE_HINT_TOOLTIP: {
      value: 9
    },
    // A notification - typically a “bubble” that belongs to a status icon.
    WINDOW_TYPE_HINT_NOTIFICATION: {
      value: 10
    },
    //A popup from a combo box.
    WINDOW_TYPE_HINT_COMBO: {
      value: 11
    },
    // A window that is used to implement a DND cursor.
    WINDOW_TYPE_HINT_DND: {
      value: 12
    },
    // Normal toplevel window.
    WINDOW_TYPE_HINT_NORMAL: {
      value: 13
    }
  })
};
