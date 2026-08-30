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
  // ドラッグできる最大オフセット (ボール半径比)
  const MAX_OFFSET = 1;
  // ミスキュー目安の円 (半径比)
  const MISCUE_LIMIT = 0.5;

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
    drawScene(out.getContext("2d"), EXPORT_SIZE, hit);
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
    try {
      const url = URL.createObjectURL(exportBlobSync());
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename(hit);
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
        file = new File([exportBlobSync()], buildFilename(hit), { type: "image/png" });
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
