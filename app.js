(() => {
  "use strict";

  const singleCanvas = document.getElementById("ball-canvas");
  const multiCanvas = document.getElementById("multi-canvas");
  const subtitle = document.getElementById("subtitle");
  const readout = document.getElementById("readout");
  const resetBtn = document.getElementById("reset-btn");
  const undoBtn = document.getElementById("undo-btn");
  const saveBtn = document.getElementById("save-btn");
  const copyBtn = document.getElementById("copy-btn");
  const shareBtn = document.getElementById("share-btn");
  const toast = document.getElementById("toast");
  const tabSingle = document.getElementById("tab-single");
  const tabMulti = document.getElementById("tab-multi");
  const panelSingle = document.getElementById("panel-single");
  const panelMulti = document.getElementById("panel-multi");

  // ===== 状態 =====

  let mode = "single";

  // シングル: 撞点 (ボール半径を1とした相対座標。yは上方向が正) とパワー
  const hit = { x: 0, y: 0 };
  const POWER_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
  const DEFAULT_POWER = 3;
  let power = DEFAULT_POWER;

  // マルチ: 複数の撞点
  const points = [];
  const MAX_POINTS = 20;
  // この距離よりボールの外へドラッグしたら削除
  const DELETE_THRESH = 1.18;

  const MAX_OFFSET = 1;
  const MISCUE_LIMIT = 0.5;

  // ===== 配置 =====

  function layoutSingle(size) {
    return {
      cx: size * 0.44,
      cy: size * 0.5,
      R: size * 0.38,
      gauge: { x: size * 0.865, y: size * 0.12, w: size * 0.07, h: size * 0.76 },
    };
  }

  function layoutMulti(size) {
    return { cx: size * 0.5, cy: size * 0.5, R: size * 0.42 };
  }

  // ===== 描画 =====

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ラシャ背景・ボール・ガイド線 (両モード共通)
  function drawTable(c, size, cx, cy, R) {
    const felt = c.createRadialGradient(cx, cy * 0.8, size * 0.1, cx, cy, size * 0.85);
    felt.addColorStop(0, "#237a44");
    felt.addColorStop(1, "#123f24");
    c.fillStyle = felt;
    c.fillRect(0, 0, size, size);

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

    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.clip();

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

    const shade = c.createRadialGradient(
      cx - R * 0.35, cy - R * 0.38, R * 0.2,
      cx, cy, R * 1.02
    );
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.75, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(40,30,20,0.22)");
    c.fillStyle = shade;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);

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
  }

  // 撞点マーカー。labelを渡すと番号入り、ghostは削除予告の半透明表示
  function drawMarker(c, size, cx, cy, R, pt, opts = {}) {
    const px = cx + pt.x * R;
    const py = cy - pt.y * R;
    const mr = R * (opts.label ? 0.105 : 0.09);

    c.save();
    if (opts.ghost) c.globalAlpha = 0.45;

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

    if (opts.label) {
      c.fillStyle = "#ffffff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      const fs = mr * (opts.label.length > 1 ? 1.05 : 1.3);
      c.font = `700 ${fs}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
      c.fillText(opts.label, px, py);
    } else {
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(px, py, mr * 0.22, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }

  function drawGauge(c, size, pw) {
    const g = layoutSingle(size).gauge;
    const gap = size * 0.012;
    const segH = (g.h - gap * 4) / 5;
    const corner = Math.min(size * 0.014, segH / 2, g.w / 2);
    const lineW = Math.max(1, size * 0.003);

    // 5段のセグメント (上=レベル5=最強)
    for (let i = 0; i < 5; i++) {
      const segLevel = 5 - i;
      const y = g.y + i * (segH + gap);
      const active = segLevel <= pw;
      roundRectPath(c, g.x, y, g.w, segH, corner);
      c.fillStyle = active ? POWER_COLORS[segLevel - 1] : "rgba(5, 20, 12, 0.5)";
      c.fill();
      c.strokeStyle = segLevel === pw ? "#ffffff" : "rgba(255,255,255,0.45)";
      c.lineWidth = segLevel === pw ? lineW * 2.2 : lineW;
      roundRectPath(c, g.x, y, g.w, segH, corner);
      c.stroke();
    }

    // 現在のレベル数字
    c.save();
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = size * 0.006;
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 ${Math.round(size * 0.048)}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    c.fillText(String(pw), g.x + g.w / 2, g.y - size * 0.05);
    c.restore();

    c.fillStyle = "rgba(255,255,255,0.85)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `600 ${Math.round(size * 0.028)}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    c.fillText("パワー", g.x + g.w / 2, g.y + g.h + size * 0.045);
  }

  function drawSceneSingle(c, size) {
    const { cx, cy, R } = layoutSingle(size);
    drawTable(c, size, cx, cy, R);
    drawGauge(c, size, power);
    drawMarker(c, size, cx, cy, R, hit);
  }

  function drawSceneMulti(c, size) {
    const { cx, cy, R } = layoutMulti(size);
    drawTable(c, size, cx, cy, R);
    points.forEach((pt, i) => {
      const len = Math.hypot(pt.x, pt.y);
      drawMarker(c, size, cx, cy, R, pt, {
        label: String(i + 1),
        ghost: len > DELETE_THRESH,
      });
    });
  }

  function drawScene(c, size) {
    if (mode === "single") drawSceneSingle(c, size);
    else drawSceneMulti(c, size);
  }

  // ===== 表示 =====

  function describe(point) {
    const xPct = Math.round(point.x * 100);
    const yPct = Math.round(point.y * 100);
    if (xPct === 0 && yPct === 0) return "中央";
    const parts = [];
    if (xPct !== 0) parts.push(`${xPct > 0 ? "右" : "左"} ${Math.abs(xPct)}%`);
    if (yPct !== 0) parts.push(`${yPct > 0 ? "上" : "下"} ${Math.abs(yPct)}%`);
    return parts.join(" ・ ");
  }

  function activeCanvas() {
    return mode === "single" ? singleCanvas : multiCanvas;
  }

  function render() {
    const canvas = activeCanvas();
    const size = canvas.clientWidth;
    if (!size) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(c, size);
    readout.textContent = mode === "single"
      ? `${describe(hit)} ・ パワー ${power}/5`
      : `撞点 ${points.length} / ${MAX_POINTS} 個`;
  }

  // ===== シングルの操作 =====

  function singleRel(ev) {
    const rect = singleCanvas.getBoundingClientRect();
    const { cx, cy, R } = layoutSingle(rect.width);
    return {
      x: (ev.clientX - rect.left - cx) / R,
      y: -(ev.clientY - rect.top - cy) / R,
    };
  }

  function setHitFromEvent(ev) {
    let { x, y } = singleRel(ev);
    const len = Math.hypot(x, y);
    if (len > MAX_OFFSET) {
      x = (x / len) * MAX_OFFSET;
      y = (y / len) * MAX_OFFSET;
    }
    hit.x = x;
    hit.y = y;
    render();
  }

  function setPowerFromEvent(ev) {
    const rect = singleCanvas.getBoundingClientRect();
    const g = layoutSingle(rect.width).gauge;
    // 下からの割合 → 1〜5のレベル
    const f = 1 - (ev.clientY - rect.top - g.y) / g.h;
    power = Math.min(5, Math.max(1, Math.ceil(f * 5)));
    render();
  }

  // ポインタが既に離れているとNotFoundErrorになるため握りつぶす
  function capturePointer(canvas, ev) {
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* no-op */
    }
  }

  let singleDragMode = null; // null | "hit" | "power"

  singleCanvas.addEventListener("pointerdown", (ev) => {
    const rect = singleCanvas.getBoundingClientRect();
    const isGauge = ev.clientX - rect.left >= rect.width * 0.8;
    singleDragMode = isGauge ? "power" : "hit";
    capturePointer(singleCanvas, ev);
    if (singleDragMode === "power") setPowerFromEvent(ev);
    else setHitFromEvent(ev);
  });
  singleCanvas.addEventListener("pointermove", (ev) => {
    if (singleDragMode === "power") setPowerFromEvent(ev);
    else if (singleDragMode === "hit") setHitFromEvent(ev);
  });
  singleCanvas.addEventListener("pointerup", () => { singleDragMode = null; });
  singleCanvas.addEventListener("pointercancel", () => { singleDragMode = null; });

  // ===== マルチの操作 =====

  function multiRel(ev) {
    const rect = multiCanvas.getBoundingClientRect();
    const { cx, cy, R } = layoutMulti(rect.width);
    return {
      x: (ev.clientX - rect.left - cx) / R,
      y: -(ev.clientY - rect.top - cy) / R,
    };
  }

  let multiDragIndex = -1;

  multiCanvas.addEventListener("pointerdown", (ev) => {
    const p = multiRel(ev);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    // 既存の撞点をつかむ (タッチしやすいよう広めの判定)
    let nearest = -1;
    let nearestDist = 0.22;
    points.forEach((pt, i) => {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
    });
    if (nearest >= 0) {
      multiDragIndex = nearest;
    } else {
      const len = Math.hypot(p.x, p.y);
      if (len > 1.05) return; // ボールの外のタップは無視
      if (points.length >= MAX_POINTS) {
        showToast(`撞点は最大${MAX_POINTS}個までです`);
        return;
      }
      const k = len > MAX_OFFSET ? MAX_OFFSET / len : 1;
      points.push({ x: p.x * k, y: p.y * k });
      multiDragIndex = points.length - 1;
    }
    capturePointer(multiCanvas, ev);
    render();
  });

  multiCanvas.addEventListener("pointermove", (ev) => {
    if (multiDragIndex < 0) return;
    const p = multiRel(ev);
    // ドラッグ中はボールの外にも追従させ、外で離すと削除
    points[multiDragIndex].x = p.x;
    points[multiDragIndex].y = p.y;
    render();
  });

  function multiDragEnd() {
    if (multiDragIndex < 0) return;
    const pt = points[multiDragIndex];
    const len = Math.hypot(pt.x, pt.y);
    if (len > DELETE_THRESH) {
      points.splice(multiDragIndex, 1);
      showToast("撞点を削除しました");
    } else if (len > MAX_OFFSET) {
      pt.x = (pt.x / len) * MAX_OFFSET;
      pt.y = (pt.y / len) * MAX_OFFSET;
    }
    multiDragIndex = -1;
    render();
  }

  multiCanvas.addEventListener("pointerup", multiDragEnd);
  multiCanvas.addEventListener("pointercancel", multiDragEnd);

  // ===== キーボード操作 (デスクトップ向け) =====
  // シングル: 矢印で撞点移動 (Shiftで大きく) / +・-でパワー
  // マルチ: Backspaceで1つ戻す
  window.addEventListener("keydown", (ev) => {
    if (mode === "multi") {
      if (ev.key === "Backspace") {
        ev.preventDefault();
        points.pop();
        render();
      }
      return;
    }
    const step = ev.shiftKey ? 0.1 : 0.02;
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft": hit.x -= step; break;
      case "ArrowRight": hit.x += step; break;
      case "ArrowUp": hit.y += step; break;
      case "ArrowDown": hit.y -= step; break;
      case "+":
      case "=": power = Math.min(5, power + 1); break;
      case "-":
      case "_": power = Math.max(1, power - 1); break;
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

  // ===== ボタン =====

  undoBtn.addEventListener("click", () => {
    points.pop();
    render();
  });

  resetBtn.addEventListener("click", () => {
    if (mode === "single") {
      hit.x = 0;
      hit.y = 0;
      power = DEFAULT_POWER;
    } else {
      points.length = 0;
    }
    render();
  });

  // ===== タブ切り替え =====

  function setMode(next) {
    mode = next;
    const isSingle = mode === "single";
    tabSingle.classList.toggle("active", isSingle);
    tabMulti.classList.toggle("active", !isSingle);
    panelSingle.classList.toggle("hidden-panel", !isSingle);
    panelMulti.classList.toggle("hidden-panel", isSingle);
    undoBtn.classList.toggle("hidden", isSingle);
    resetBtn.classList.toggle("btn-span2", !isSingle);
    resetBtn.textContent = isSingle ? "リセット" : "全消去";
    subtitle.textContent = isSingle
      ? "ボールをタップして撞点、右のバーでパワーを調整"
      : "タップで追加 / ドラッグで移動 / ボールの外へ出して削除";
    render();
  }

  tabSingle.addEventListener("click", () => setMode("single"));
  tabMulti.addEventListener("click", () => setMode("multi"));

  // ===== 画像の書き出し (保存 / コピー / 共有) =====

  const EXPORT_SIZE = 1080;

  let toastTimer = 0;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function makeExportCanvas() {
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    drawScene(out.getContext("2d"), EXPORT_SIZE);
    return out;
  }

  // toBlob(非同期)だとWebKit系でユーザー操作の有効期限が切れ、
  // clipboard.write / navigator.share がNotAllowedErrorになるため、
  // toDataURLで同期的にBlobを作る。
  function exportBlobSync() {
    const b64 = makeExportCanvas().toDataURL("image/png").split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  }

  function buildFilename() {
    if (mode === "multi") return `hitpoints_${points.length}.png`;
    const xPct = Math.round(hit.x * 100);
    const yPct = Math.round(hit.y * 100);
    const parts = ["hitpoint"];
    if (xPct === 0 && yPct === 0) {
      parts.push("center");
    } else {
      if (xPct !== 0) parts.push(`${xPct > 0 ? "R" : "L"}${Math.abs(xPct)}`);
      if (yPct !== 0) parts.push(`${yPct > 0 ? "U" : "D"}${Math.abs(yPct)}`);
    }
    parts.push(`P${power}`);
    return parts.join("_") + ".png";
  }

  saveBtn.addEventListener("click", () => {
    try {
      const url = URL.createObjectURL(exportBlobSync());
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      showToast("保存できませんでした");
    }
  });

  // クリップボードへコピー。タップと同じ同期処理内でwriteまで呼ぶこと
  // (awaitを挟むとWebKitでユーザー操作の有効期限が切れる)。
  if (navigator.clipboard && window.ClipboardItem) {
    copyBtn.addEventListener("click", () => {
      try {
        const item = new ClipboardItem({ "image/png": exportBlobSync() });
        navigator.clipboard.write([item]).then(
          () => showToast("画像をコピーしました"),
          (err) => showToast(`コピーできませんでした (${err.name})`)
        );
      } catch (err) {
        showToast(`コピーできませんでした (${err.name})`);
      }
    });
  } else {
    copyBtn.classList.add("hidden");
  }

  // 共有シート (LINEやNotionへ直接渡す)。こちらも同期的に呼ぶ。
  if (navigator.share) {
    shareBtn.addEventListener("click", () => {
      let file;
      try {
        file = new File([exportBlobSync()], buildFilename(), { type: "image/png" });
      } catch (err) {
        showToast(`共有できませんでした (${err.name})`);
        return;
      }
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        showToast("この端末では画像の共有に対応していません");
        return;
      }
      navigator.share({ files: [file] }).catch((err) => {
        if (err && err.name !== "AbortError") {
          showToast(`共有できませんでした (${err.name})`);
        }
      });
    });
  } else {
    shareBtn.classList.add("hidden");
  }

  // ===== 初期化 =====

  const resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(singleCanvas);
  resizeObserver.observe(multiCanvas);
  render();
})();
