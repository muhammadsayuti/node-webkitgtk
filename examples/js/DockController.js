fabric.RectAsymmetric = fabric.util.createClass(
  fabric.Rect,
  /** @lends fabric.Rect.prototype */ {
    /**
     * Side of rounding corners
     * @type String
     * @default
     */
    side: "top",

    _render: function (ctx, noTransform) {
      if (this.width === 1 && this.height === 1) {
        ctx.fillRect(0, 0, 1, 1);
        return;
      }

      var rx = this.rx ? Math.min(this.rx, this.width / 2) : 0,
        ry = this.ry ? Math.min(this.ry, this.height / 2) : 0,
        w = this.width,
        h = this.height,
        x = noTransform ? this.left : -this.width / 2,
        y = noTransform ? this.top : -this.height / 2,
        isRoundedLeft = (rx !== 0 || ry !== 0) && this.side === "left",
        isRoundedRight = (rx !== 0 || ry !== 0) && this.side === "right",
        isRoundedTop = (rx !== 0 || ry !== 0) && (this.side === "top" || this.side === "all"),
        isRoundedBottom = (rx !== 0 || ry !== 0) && (this.side === "bottom" || this.side === "all"),

        k = 1 - 0.5522847498;

      ctx.beginPath();

      ctx.moveTo(x + (isRoundedLeft ? rx : 0), y);
      ctx.lineTo(x + w - (isRoundedRight ? rx : isRoundedTop ? rx : 0), y);
      (isRoundedRight || isRoundedTop) &&
        ctx.bezierCurveTo(x + w - k * rx, y, x + w, y + k * ry, x + w, y + ry);
      ctx.lineTo(x + w, y + h - (isRoundedRight ? ry : isRoundedBottom ? ry : 0));
      (isRoundedRight || isRoundedBottom) &&
        ctx.bezierCurveTo(
          x + w,
          y + h - k * ry,
          x + w - k * rx,
          y + h,
          x + w - rx,
          y + h
        );
      ctx.lineTo(x + (isRoundedLeft ? rx : isRoundedBottom ? rx : 0), y + h);
      (isRoundedLeft || isRoundedBottom) &&
        ctx.bezierCurveTo(x + k * rx, y + h, x, y + h - k * ry, x, y + h - ry);
      ctx.lineTo(x, y + (isRoundedLeft ? ry : isRoundedTop ? ry : 0));
      (isRoundedLeft || isRoundedTop) &&
        ctx.bezierCurveTo(x, y + k * ry, x + k * rx, y, x + rx, y);

      ctx.closePath();

      this._renderFill(ctx);
      this._renderStroke(ctx);
    }
  }
);


class DockController {
  constructor({ position, itemSize, items, padding, itemPadding, radius, fill }) {
    let side, top, left, width, height,
      paddingLeft = padding.left || padding,
      paddingRight = padding.right || padding,
      paddingTop = padding.top || padding,
      paddingBottom = padding.bottom || padding,
      itemPaddingRight = itemPadding.right || itemPadding,
      itemPaddingLeft = itemPadding.left || itemPadding,
      itemPaddingTop = itemPadding.top || (paddingTop && paddingTop > 0) ? paddingTop : itemPadding,
      itemPaddingBottom = itemPadding.Bottom || (paddingBottom && paddingBottom > 0) ? paddingBottom : itemPadding,
      noRadius = !radius || radius === 0;

    this.padding = padding;
    this.position = position;
    this.itemSize = itemSize;
    this.items = items || [];

    let iconWidth = itemSize + itemPaddingLeft + itemPaddingRight;
    height = itemSize + (paddingTop + paddingBottom);
    width = (iconWidth * icons.length) + (paddingRight + paddingLeft);

    this.width = width;
    this.height = height;

    if (position === 'top') side = 'bottom', top = 0, left = (window.innerWidth / 2) - (width / 2);
    else if (position === 'bottom') side = 'top', top = window.innerHeight - height, left = (window.innerWidth / 2) - (width / 2);
    else if (position === 'left') side = 'right', top = window.innerHeight - height, left = 0;
    else if (position === 'right') side = 'left', top = window.innerHeight - height, left = window.innerWidth - width;

    this.add = this.add.bind(this);
    this.resizeCanvas = this.resizeCanvas.bind(this);

    this.dock = new fabric.RectAsymmetric({
      left: left,
      top: top,
      fill: fill,
      width: width,
      height: height,
      side: (!noRadius) ? side : undefined,
      rx: radius,
      ry: radius,
      hoverCursor: "default",
      selectable: false,
      skewY: 0
    });
    this.tooltipText = new fabric.IText('', {
      fontSize: 22,
      originX: 'center',
      originY: 'center',
      fill: "white",
      selectable: false
    });
    this.tooltipBg = new fabric.RectAsymmetric({
      radius: 10,
      originX: 'center',
      originY: 'center',
      fill: 'rgba(0,0,0,1)',
      width: 110,
      height: 36,
      hoverCursor: "default",
      selectable: false,
      rx: 5,
      ry: 5,
      side: "all",
    });
    this.tooltip = new fabric.Group([this.tooltipBg, this.tooltipText], {
      left: this.dock.left,
      top: this.dock.top - 70,
      height: 30,
      opacity: 0
    });

    this.canvas = new fabric.Canvas("container");
    this.canvas.on('mouse:down', this.onMouseDown.bind(this));
    this.canvas.on('mouse:over', this.onMouseOver.bind(this));
    this.canvas.on('mouse:out', () => {
      this.tooltip.animate({ opacity: 0 })
    });
    this.canvas.selection = false;

    window.addEventListener("resize", this.resizeCanvas.bind(this), false);
    this.resizeCanvas();
    this.canvas.add(this.dock);
    this.canvas.add(this.tooltip);

    this.lastX = this.dock.left + paddingLeft;
    if (items && items.length > 0) {
      items.forEach((item) => {
        this.add(item);
      })
    }
  }
  resizeCanvas() {
    this.canvas.setHeight(window.innerHeight);
    this.canvas.setWidth(window.innerWidth);
    this.canvas.renderAll();
  }
  onMouseOver(e) {
    if (e.target && e.target !== this.dock && e.target !== this.tooltip) {
      this.tooltip.item(1).set({ text: e.target.name });
      const width = this.tooltip.item(1).width + 14;
      this.tooltip.item(0).set({ width });
      const center = e.target.width / 2;
      const left = e.target.left - ((this.tooltip.item(1).width / 2) - center + 7);

      this.tooltip.animate({ width, left, opacity: 1 }, {
        duration: 500,
        onChange: this.canvas.renderAll.bind(this.canvas),
        // easing: fabric.util.ease["easeInCubic"],
        duration: 500,
      });
    } else {
      this.tooltip.animate({ opacity: 0 }, {
        duration: 500,
        onChange: this.canvas.renderAll.bind(this.canvas),
        easing: fabric.util.ease["easeOutCubic"],
        duration: 500
      });
    }
  }
  onMouseDown(e) {
    if (e.target && e.target !== this.dock && !e.target.animating && e.target.animation !== false) {
      e.target.animating = true;
      let tmpTop = e.target.top;
      e.target.set({ top: e.target.top - 40 })
      e.target.animate('top', tmpTop, {
        duration: 500,
        onChange: this.canvas.renderAll.bind(this.canvas),
        onComplete: function () {
          e.target.animating = false;
        },
        easing: fabric.util.ease["easeOutBounce"]
      });
    }
  }
  setGradient(gradient) {
    this.dock.setGradient("fill", gradient);
  }
  update() {
    let x = 0, w, h, side, top, left, position = this.position,
      paddingLeft = this.padding.left || this.padding,
      paddingRight = this.padding.right || this.padding,
      paddingTop = this.padding.top || this.padding,
      paddingBottom = this.padding.bottom || this.padding;

    h = this.itemSize + (paddingTop + paddingBottom);

    this.items.forEach((item, index) => {
      let iconWidth = item.width || this.itemSize;
      if (i === 0) {
        w += iconWidth + (paddingLeft + paddingRight);
      } else {
        w += iconWidth + paddingLeft + paddingRight;
      }
    });

    if (position === 'top') side = 'bottom', top = 0, left = (window.innerWidth / 2) - (w / 2);
    else if (position === 'bottom') side = 'top', top = window.innerHeight - h;
    else if (position === 'left') side = 'right', top = window.innerHeight - h, left = 0;
    else if (position === 'right') side = 'left', top = window.innerHeight - h, left = window.innerWidth - width;

    this.dock.set({ width: w, side, top, left });
  }
  add(item) {
    let paddingLeft = this.padding.left || this.padding;
    let paddingRight = this.padding.right || this.padding;
    let paddingTop = this.padding.top || this.padding;
    if (!item.image && item.path) {
      this.items.push(item);
      fabric.Image.fromURL(item.path, (img) => {
        img.name = item.name;
        let itemPaddingLeft = this.padding.left || this.padding;
        let paddingRight = this.padding.right || this.padding;
        let paddingTop = this.padding.top || this.padding;
        let width = item.width || this.itemSize;
        let height = item.height || this.itemSize;

        let lastX = this.lastX;
        let left = (lastX === (this.dock.left + paddingLeft)) ? lastX + paddingLeft : lastX + (width + paddingLeft + paddingRight);
        let top = this.dock.top + paddingTop;

        this.lastX = left;
        img.set({
          width: item.width || width,
          height: item.height || height,
          left,
          top,
          angle: 0,
          hoverCursor: "pointer",
          selectable: false,
        });
        img.animation = item.animation;
        // add image onto canvas (it also re-render the canvas)
        this.canvas.add(img);
      });
    }
  }
}
