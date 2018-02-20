

module.exports.defineConstants = function defineConstants(obj) {
  Object.defineProperties(obj, {
    WINDOW_POPUP: {
      value: 0
    },
    WINDOW_TOPLEVEL: {
      value: 1
    },
    WINDOW_TYPE_HINT_DESKTOP: {
      value: 0
    },
    WINDOW_TYPE_HINT_DOCK: {
      value: 1
    },
    WINDOW_TYPE_TOOLBAR: {
      value: 2
    },
    WINDOW_TYPE_MENU: {
      value: 3
    },
    WINDOW_TYPE_UTILITY: {
      value: 4
    },
    WINDOW_TYPE_SPLASH: {
      value: 5
    },
    WINDOW_TYPE_DIALOG: {
      value: 6
    },
    WINDOW_TYPE_DROPDOWN_MENU: {
      value: 7
    },
    WINDOW_TYPE_POPUP_MENU: {
      value: 8
    },
    WINDOW_TYPE_TOOLTIP: {
      value: 9
    },
    WINDOW_TYPE_NOTIFICATION: {
      value: 10
    },
    WINDOW_TYPE_COMBO: {
      value: 11
    },
    WINDOW_TYPE_DND: {
      value: 12
    },
    WINDOW_TYPE_NORMAL: {
      value: 13
    }
  })
};
