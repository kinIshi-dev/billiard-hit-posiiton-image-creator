(() => {
  "use strict";

  const canvas = document.getElementById("ball-canvas");
  const ctx = canvas.getContext("2d");
  const readout = document.getElementById("readout");
  const resetBtn = document.getElementById("reset-btn");
  const saveBtn = document.getElementById("save-btn");
  const copyBtn = document.getElementById("copy-btn");
  const shareBtn = document.getElementById("share-btn");
  const toast = document.getElementById("toast");

  // 撞点 (ボール半径を1とした相対座標。yは上方向が正)
  const hit = { x: 0, y: 0 };
  // パワー (1〜5の5段階)
  const POWER_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
  const DEFAULT_POWER = 3;
  let power = DEFAULT_POWER;
  // ドラッグできる最大オフセット (ボール半径比)
  const MAX_OFFSET = 1;
  // ミスキュー目安の円 (半径比)
  const MISCUE_LIMIT = 0.5;

  // キャンバス内の配置 (正方形サイズ基準)
  function layout(size) {
    return {
      cx: size * 0.44,
      cy: size * 0.5,
      R: size * 0.38,
      gauge: { x: size * 0.865, y: size * 0.12, w: size * 0.07, h: size * 0.76 },
    };
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawGauge(c, size, pw) {
    const g = layout(size).gauge;
    const gap = size * 0.012;
    const segH = (g.h - gap * 4) / 5;
    const corner = Math.min(size * 0.014, segH / 2, g.w / 2);
    const lineW = Math.max(1, size * 0.003);

    // 5段のセグメント (上=レベル5=フルパワー)
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

  function drawScene(c, size, point, pw) {
    const { cx, cy, R } = layout(size);

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

    // パワーインジケーター
    drawGauge(c, size, pw);

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
    drawScene(ctx, size, hit, power);
    readout.textContent = `${describe(hit)} ・ パワー ${power}/5`;
  }

  function setHitFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const { cx, cy, R } = layout(rect.width);
    let x = (ev.clientX - rect.left - cx) / R;
    let y = -(ev.clientY - rect.top - cy) / R;
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
    const rect = canvas.getBoundingClientRect();
    const g = layout(rect.width).gauge;
    // 下からの割合 → 1〜5のレベル
    const f = 1 - (ev.clientY - rect.top - g.y) / g.h;
    power = Math.min(5, Math.max(1, Math.ceil(f * 5)));
    render();
  }

  // ドラッグ中の操作対象 (null | "hit" | "power")
  let dragMode = null;

  canvas.addEventListener("pointerdown", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const isGauge = ev.clientX - rect.left >= rect.width * 0.8;
    dragMode = isGauge ? "power" : "hit";
    canvas.setPointerCapture(ev.pointerId);
    if (dragMode === "power") setPowerFromEvent(ev);
    else setHitFromEvent(ev);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (dragMode === "power") setPowerFromEvent(ev);
    else if (dragMode === "hit") setHitFromEvent(ev);
  });
  canvas.addEventListener("pointerup", () => {
    dragMode = null;
  });
  canvas.addEventListener("pointercancel", () => {
    dragMode = null;
  });

  // キーボード操作 (デスクトップ向け)
  // 矢印: 撞点移動 (Shiftで大きく) / +・-: パワー調整
  window.addEventListener("keydown", (ev) => {
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

  resetBtn.addEventListener("click", () => {
    hit.x = 0;
    hit.y = 0;
    power = DEFAULT_POWER;
    render();
  });

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
    drawScene(out.getContext("2d"), EXPORT_SIZE, hit, power);
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

  function buildFilename(point, pw) {
    const xPct = Math.round(point.x * 100);
    const yPct = Math.round(point.y * 100);
    const parts = ["hitpoint"];
    if (xPct === 0 && yPct === 0) {
      parts.push("center");
    } else {
      if (xPct !== 0) parts.push(`${xPct > 0 ? "R" : "L"}${Math.abs(xPct)}`);
      if (yPct !== 0) parts.push(`${yPct > 0 ? "U" : "D"}${Math.abs(yPct)}`);
    }
    parts.push(`P${pw}`);
    return parts.join("_") + ".png";
  }

  saveBtn.addEventListener("click", () => {
    try {
      const url = URL.createObjectURL(exportBlobSync());
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename(hit, power);
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
        file = new File([exportBlobSync()], buildFilename(hit, power), { type: "image/png" });
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
  resizeObserver.observe(canvas);
  render();
})();
