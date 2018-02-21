class DockItem {
  constructor(info) {
    if (!info.image && !info.path) {
      throw new Error('Dock image and image path is not set');
    }
    this.animating = false;
    Object.defineProperties(this, info);
  }
}
