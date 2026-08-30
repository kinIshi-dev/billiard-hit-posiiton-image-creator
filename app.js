(() => {
  "use strict";

  const canvas = document.getElementById("ball-canvas");
  const ctx = canvas.getContext("2d");
  const readout = document.getElementById("readout");
  const resetBtn = document.getElementById("reset-btn");
  const saveBtn = document.getElementById("save-btn");

  // 撞点 (ボール半径を1とした相対座標。yは上方向が正)
  const hit = { x: 0, y: 0 };
  // ドラッグできる最大オフセット (ボール半径比)
  const MAX_OFFSET = 0.8;
  // ミスキュー目安の円 (半径比)
  const MISCUE_LIMIT = 0.5;

  // デュラミス(メジャーボール)風の赤い測定ドット。
  // angle: 中心からの方向(度), dist: 中心からの距離(半径比)
  const DOTS = [
    { angle: -55, dist: 0.68 },
    { angle: 30, dist: 0.82 },
    { angle: 115, dist: 0.72 },
    { angle: 185, dist: 0.8 },
    { angle: 250, dist: 0.7 },
  ];
  const DOT_RADIUS = 0.13; // 半径比
  const DOT_COLOR = "#a3312b";

  function drawScene(c, size, point) {
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.42;

    // 背景 (ラシャ)
    const felt = c.createRadialGradient(cx, cy * 0.8, size * 0.1, cx, cy, size * 0.85);
    felt.addColorStop(0, "#237a44");
    felt.addColorStop(1, "#123f24");
    c.fillStyle = felt;
    c.fillRect(0, 0, size, size);

    // ボールの落ち影
    c.save();
    c.translate(cx, cy + R * 0.92);
    c.scale(1, 0.28);
    const shadow = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
    shadow.addColorStop(0, "rgba(0,0,0,0.4)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = shadow;
    c.beginPath();
    c.arc(0, 0, R * 0.95, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // ボール本体
    const body = c.createRadialGradient(
      cx - R * 0.35, cy - R * 0.38, R * 0.1,
      cx, cy, R * 1.05
    );
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.55, "#f5f4f0");
    body.addColorStop(0.85, "#ddd9d2");
    body.addColorStop(1, "#b9b4ab");
    c.fillStyle = body;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();

    // 以降の描画はボール内にクリップ
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.clip();

    // 赤ドット (球面上にあるように、外周ほど半径方向へつぶす)
    for (const d of DOTS) {
      const rad = (d.angle * Math.PI) / 180;
      const dx = Math.cos(rad) * d.dist * R;
      const dy = Math.sin(rad) * d.dist * R;
      const squash = Math.sqrt(Math.max(0, 1 - d.dist * d.dist));
      c.save();
      c.translate(cx + dx, cy + dy);
      c.rotate(rad);
      c.scale(squash, 1);
      const dotShade = c.createRadialGradient(
        -DOT_RADIUS * R * 0.3, -DOT_RADIUS * R * 0.3, 0,
        0, 0, DOT_RADIUS * R
      );
      dotShade.addColorStop(0, "#b8453e");
      dotShade.addColorStop(1, DOT_COLOR);
      c.fillStyle = dotShade;
      c.beginPath();
      c.arc(0, 0, DOT_RADIUS * R, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // ガイド (十字線とミスキュー目安円)
    c.strokeStyle = "rgba(30, 41, 59, 0.28)";
    c.lineWidth = Math.max(1, size * 0.0035);
    c.beginPath();
    c.moveTo(cx - R, cy);
    c.lineTo(cx + R, cy);
    c.moveTo(cx, cy - R);
    c.lineTo(cx, cy + R);
    c.stroke();

    c.setLineDash([size * 0.012, size * 0.012]);
    c.beginPath();
    c.arc(cx, cy, R * MISCUE_LIMIT, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    // 球面の陰影 (下側をわずかに暗く)
    const shade = c.createRadialGradient(
      cx - R * 0.35, cy - R * 0.38, R * 0.2,
      cx, cy, R * 1.02
    );
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.75, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(40,30,20,0.22)");
    c.fillStyle = shade;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);

    // ハイライト
    const gloss = c.createRadialGradient(
      cx - R * 0.38, cy - R * 0.45, 0,
      cx - R * 0.38, cy - R * 0.45, R * 0.55
    );
    gloss.addColorStop(0, "rgba(255,255,255,0.9)");
    gloss.addColorStop(0.4, "rgba(255,255,255,0.25)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gloss;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);

    c.restore();

    // 撞点マーカー
    const px = cx + point.x * R;
    const py = cy - point.y * R;
    const mr = R * 0.09;

    c.save();
    c.shadowColor = "rgba(0,0,0,0.35)";
    c.shadowBlur = size * 0.012;
    c.fillStyle = "#2b7de9";
    c.beginPath();
    c.arc(px, py, mr, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.strokeStyle = "#ffffff";
    c.lineWidth = Math.max(1.5, size * 0.006);
    c.beginPath();
    c.arc(px, py, mr, 0, Math.PI * 2);
    c.stroke();

    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(px, py, mr * 0.22, 0, Math.PI * 2);
    c.fill();
  }

  function describe(point) {
    const xPct = Math.round(point.x * 100);
    const yPct = Math.round(point.y * 100);
    if (xPct === 0 && yPct === 0) return "中央";
    const parts = [];
    if (xPct !== 0) parts.push(`${xPct > 0 ? "右" : "左"} ${Math.abs(xPct)}%`);
    if (yPct !== 0) parts.push(`${yPct > 0 ? "上" : "下"} ${Math.abs(yPct)}%`);
    return parts.join(" ・ ");
  }

  // ===== 表示キャンバス =====

  function render() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, size, hit);
    readout.textContent = describe(hit);
  }

  function setHitFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const R = size * 0.42;
    let x = (ev.clientX - rect.left - size / 2) / R;
    let y = -(ev.clientY - rect.top - size / 2) / R;
    const len = Math.hypot(x, y);
    if (len > MAX_OFFSET) {
      x = (x / len) * MAX_OFFSET;
      y = (y / len) * MAX_OFFSET;
    }
    hit.x = x;
    hit.y = y;
    render();
  }

  let dragging = false;

  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    canvas.setPointerCapture(ev.pointerId);
    setHitFromEvent(ev);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (dragging) setHitFromEvent(ev);
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // キーボード操作 (デスクトップ向け)
  window.addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 0.1 : 0.02;
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft": hit.x -= step; break;
      case "ArrowRight": hit.x += step; break;
      case "ArrowUp": hit.y += step; break;
      case "ArrowDown": hit.y -= step; break;
      default: handled = false;
    }
    if (handled) {
      const len = Math.hypot(hit.x, hit.y);
      if (len > MAX_OFFSET) {
        hit.x = (hit.x / len) * MAX_OFFSET;
        hit.y = (hit.y / len) * MAX_OFFSET;
      }
      ev.preventDefault();
      render();
    }
  });

  resetBtn.addEventListener("click", () => {
    hit.x = 0;
    hit.y = 0;
    render();
  });

  // ===== 画像保存 =====

  const EXPORT_SIZE = 1080;

  function buildFilename(point) {
    const xPct = Math.round(point.x * 100);
    const yPct = Math.round(point.y * 100);
    const parts = ["hitpoint"];
    if (xPct === 0 && yPct === 0) {
      parts.push("center");
    } else {
      if (xPct !== 0) parts.push(`${xPct > 0 ? "R" : "L"}${Math.abs(xPct)}`);
      if (yPct !== 0) parts.push(`${yPct > 0 ? "U" : "D"}${Math.abs(yPct)}`);
    }
    return parts.join("_") + ".png";
  }

  saveBtn.addEventListener("click", () => {
    const out = document.createElement("canvas");
    // 下部にラベル帯を追加
    const labelBand = Math.round(EXPORT_SIZE * 0.1);
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE + labelBand;
    const octx = out.getContext("2d");

    drawScene(octx, EXPORT_SIZE, hit);

    // ラベル帯
    octx.fillStyle = "#0e3019";
    octx.fillRect(0, EXPORT_SIZE, EXPORT_SIZE, labelBand);
    octx.fillStyle = "#ffffff";
    octx.font = `600 ${Math.round(labelBand * 0.42)}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillText(`撞点: ${describe(hit)}`, EXPORT_SIZE / 2, EXPORT_SIZE + labelBand / 2);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename(hit);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  });

  // ===== 初期化 =====

  const resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(canvas);
  render();
})();
