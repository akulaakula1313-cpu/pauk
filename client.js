/* ==========================================================================
   SANI GROUP — «Паук» пасьянс. Игровая логика (client.js)
   Работает и мышью (drag), и тапом (выбрать карту -> выбрать столбец).
   ========================================================================== */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Константы и модель данных
  // ---------------------------------------------------------------------
  const SUITS_ALL = [
    { key: "S", glyph: "♠", color: "black" },
    { key: "H", glyph: "♥", color: "red" },
    { key: "D", glyph: "♦", color: "red" },
    { key: "C", glyph: "♣", color: "black" },
  ];
  const RANK_NAMES = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const COLS = 10;
  const TOTAL_CARDS = 104;
  const TOTAL_SEQUENCES = 8;

  let state = null;     // текущее игровое состояние
  let history = [];      // стек для отмены хода
  let timerHandle = null;
  let startTime = null;

  // ---------------------------------------------------------------------
  // Колода
  // ---------------------------------------------------------------------
  function buildDeck(numSuits) {
    const suits = SUITS_ALL.slice(0, numSuits);
    const setsPerSuit = TOTAL_CARDS / (13 * numSuits);
    const deck = [];
    let uid = 0;
    for (const suit of suits) {
      for (let s = 0; s < setsPerSuit; s++) {
        for (let rank = 1; rank <= 13; rank++) {
          deck.push({
            id: "c" + uid++,
            suit: suit.key,
            glyph: suit.glyph,
            color: suit.color,
            rank,
            faceUp: false,
          });
        }
      }
    }
    shuffle(deck);
    return deck;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---------------------------------------------------------------------
  // Инициализация партии
  // ---------------------------------------------------------------------
  function newGame(numSuits) {
    const deck = buildDeck(numSuits);
    const columns = Array.from({ length: COLS }, () => []);

    for (let c = 0; c < COLS; c++) {
      const count = c < 4 ? 6 : 5;
      for (let i = 0; i < count; i++) {
        const card = deck.pop();
        card.faceUp = i === count - 1;
        columns[c].push(card);
      }
    }

    // остаток - резерв, порциями по 10
    const stockDeals = [];
    while (deck.length) {
      stockDeals.push(deck.splice(0, 10));
    }

    state = {
      numSuits,
      columns,
      stockDeals,      // массив порций (каждая порция - 10 карт), последняя порция = deck.pop() и т.д.
      completed: 0,
      moves: 0,
      selection: null,  // { col, index }
      finished: false,
    };
    history = [];
    updateDifficultyLabel(numSuits);
    resetTimer();
    render();
    setUndoEnabled(false);
  }

  // ---------------------------------------------------------------------
  // Вспомогательные проверки правил
  // ---------------------------------------------------------------------
  // Проверяет, что cards[fromIndex..end] образуют корректную последовательность
  // (одна масть, убывание на 1), и все карты открыты.
  function isMovableRun(column, fromIndex) {
    for (let i = fromIndex; i < column.length; i++) {
      if (!column[i].faceUp) return false;
      if (i > fromIndex) {
        const prev = column[i - 1];
        const cur = column[i];
        if (cur.suit !== prev.suit || cur.rank !== prev.rank - 1) return false;
      }
    }
    return true;
  }

  function canPlace(movingCard, targetColumn) {
    if (targetColumn.length === 0) return true;
    const top = targetColumn[targetColumn.length - 1];
    return top.faceUp && top.rank === movingCard.rank + 1;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({
      columns: state.columns,
      stockDeals: state.stockDeals,
      completed: state.completed,
      moves: state.moves,
    }));
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 60) history.shift();
    setUndoEnabled(true);
  }

  function undo() {
    if (!history.length || state.finished) return;
    const snap = history.pop();
    state.columns = snap.columns;
    state.stockDeals = snap.stockDeals;
    state.completed = snap.completed;
    state.moves = snap.moves;
    state.selection = null;
    setUndoEnabled(history.length > 0);
    render();
  }

  // ---------------------------------------------------------------------
  // Ход: перемещение серии карт
  // ---------------------------------------------------------------------
  function tryMove(fromCol, fromIndex, toCol) {
    if (fromCol === toCol) return false;
    const source = state.columns[fromCol];
    const target = state.columns[toCol];
    if (fromIndex < 0 || fromIndex >= source.length) return false;
    if (!isMovableRun(source, fromIndex)) return false;

    const moving = source[fromIndex];
    if (!canPlace(moving, target)) return false;

    pushHistory();

    const run = source.splice(fromIndex, source.length - fromIndex);
    target.push(...run);

    // открыть карту, обнажившуюся в источнике
    if (source.length) {
      source[source.length - 1].faceUp = true;
    }

    state.moves++;
    state.selection = null;

    checkSequenceComplete(toCol);
    render();
    checkGameEnd();
    return true;
  }

  // Проверка завершённой последовательности К..A одной масти в конце столбца
  function checkSequenceComplete(colIndex) {
    const col = state.columns[colIndex];
    if (col.length < 13) return;
    const slice = col.slice(col.length - 13);
    const suit = slice[0].suit;
    let ok = slice[0].rank === 13;
    for (let i = 0; ok && i < 13; i++) {
      if (slice[i].suit !== suit || slice[i].rank !== 13 - i) ok = false;
    }
    if (!ok) return;

    col.splice(col.length - 13, 13);
    if (col.length) col[col.length - 1].faceUp = true;
    state.completed++;
    updateSequenceLabel();
    flashCompletion(colIndex);
  }

  function flashCompletion(colIndex) {
    const el = document.querySelectorAll(".column")[colIndex];
    if (el) {
      el.animate(
        [{ boxShadow: "inset 0 0 0 3px #ecd28a" }, { boxShadow: "inset 0 0 0 0px transparent" }],
        { duration: 700, easing: "ease-out" }
      );
    }
  }

  // ---------------------------------------------------------------------
  // Раздача из резерва
  // ---------------------------------------------------------------------
  function dealFromStock() {
    if (state.finished) return;
    if (!state.stockDeals.length) return;
    if (state.columns.some((c) => c.length === 0)) {
      shakeStock();
      return;
    }
    pushHistory();
    const portion = state.stockDeals.pop();
    for (let c = 0; c < COLS; c++) {
      const card = portion[c];
      card.faceUp = true;
      state.columns[c].push(card);
      checkSequenceComplete(c);
    }
    state.moves++;
    render();
    checkGameEnd();
  }

  function shakeStock() {
    const dock = document.getElementById("stock-pile");
    dock.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 260 }
    );
  }

  // ---------------------------------------------------------------------
  // Проверка конца игры
  // ---------------------------------------------------------------------
  function hasAnyLegalMove() {
    if (state.columns.some((c) => c.length === 0)) return true; // можно сходить в пустой столбец
    for (let c = 0; c < COLS; c++) {
      const col = state.columns[c];
      for (let i = col.length - 1; i >= 0; i--) {
        if (!col[i].faceUp) break;
        if (!isMovableRun(col, i)) break;
        const moving = col[i];
        for (let t = 0; t < COLS; t++) {
          if (t === c) continue;
          if (canPlace(moving, state.columns[t])) return true;
        }
      }
    }
    return false;
  }

  function checkGameEnd() {
    if (state.completed >= TOTAL_SEQUENCES) {
      finishGame(true);
      return;
    }
    if (!state.stockDeals.length && !hasAnyLegalMove()) {
      finishGame(false);
    }
  }

  function finishGame(won) {
    state.finished = true;
    stopTimer();
    const overlay = document.getElementById("modal-end");
    document.getElementById("end-icon").textContent = won ? "🏆" : "🕸️";
    document.getElementById("end-title").textContent = won ? "Победа!" : "Игра окончена";
    document.getElementById("end-sub").textContent = won
      ? "Все восемь последовательностей собраны. Отличная партия!"
      : "Больше нет доступных ходов и карт в колоде.";
    document.getElementById("end-moves").textContent = state.moves;
    document.getElementById("end-time").textContent = formatTime(elapsedSeconds());
    overlay.hidden = false;
  }

  // ---------------------------------------------------------------------
  // Таймер
  // ---------------------------------------------------------------------
  function resetTimer() {
    stopTimer();
    startTime = Date.now();
    timerHandle = setInterval(() => {
      document.getElementById("stat-time").textContent = formatTime(elapsedSeconds());
    }, 1000);
  }
  function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }
  function elapsedSeconds() {
    return Math.floor((Date.now() - startTime) / 1000);
  }
  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ---------------------------------------------------------------------
  // Рендер
  // ---------------------------------------------------------------------
  function render() {
    renderTableau();
    renderStock();
    document.getElementById("stat-moves").textContent = state.moves;
    updateSequenceLabel();
  }

  function updateSequenceLabel() {
    document.getElementById("stat-sequences").innerHTML = `${state.completed}<i>/${TOTAL_SEQUENCES}</i>`;
    document.getElementById("stat-stock").textContent = state.stockDeals.length;
  }

  function updateDifficultyLabel(numSuits) {
    const label = numSuits === 1 ? "1 масть" : numSuits === 2 ? "2 масти" : "4 масти";
    document.getElementById("stat-difficulty").textContent = label;
  }

  function renderTableau() {
    const tableau = document.getElementById("tableau");
    tableau.innerHTML = "";
    state.columns.forEach((col, colIndex) => {
      const colEl = document.createElement("div");
      colEl.className = "column";
      colEl.dataset.col = colIndex;

      const height = col.length
        ? `calc(var(--card-h) + ${(col.length - 1)} * var(--stack-offset))`
        : "var(--card-h)";
      colEl.style.minHeight = height;

      col.forEach((card, cardIndex) => {
        const cardEl = buildCardEl(card, colIndex, cardIndex);
        cardEl.style.top = `calc(${cardIndex} * var(--stack-offset))`;
        cardEl.style.zIndex = cardIndex;
        colEl.appendChild(cardEl);
      });

      attachColumnDropHandlers(colEl, colIndex);
      tableau.appendChild(colEl);
    });
  }

  function buildCardEl(card, colIndex, cardIndex) {
    const el = document.createElement("div");
    el.className = "card " + (card.color === "red" ? "is-red" : "is-black");
    el.dataset.col = colIndex;
    el.dataset.index = cardIndex;
    el.dataset.id = card.id;

    if (card.faceUp) {
      el.innerHTML = `
        <div class="card-face ${isSelected(colIndex, cardIndex) ? "is-selected" : ""}">
          <div class="corner top"><span>${RANK_NAMES[card.rank]}</span><span class="csuit">${card.glyph}</span></div>
          <div class="pip">${card.glyph}</div>
          <div class="corner bottom"><span>${RANK_NAMES[card.rank]}</span><span class="csuit">${card.glyph}</span></div>
        </div>`;
    } else {
      el.innerHTML = `<div class="card-back"></div>`;
    }

    if (isSelected(colIndex, cardIndex)) el.classList.add("selected");

    if (card.faceUp) {
      attachCardInteraction(el, colIndex, cardIndex);
    }
    return el;
  }

  function isSelected(col, index) {
    return state.selection && state.selection.col === col && state.selection.index === index;
  }

  function renderStock() {
    const visual = document.getElementById("stock-visual");
    visual.innerHTML = "";
    const dock = document.getElementById("stock-pile");
    const remaining = state.stockDeals.length;
    dock.classList.toggle("empty", remaining === 0);

    const layers = Math.min(remaining, 5);
    for (let i = 0; i < layers; i++) {
      const back = document.createElement("div");
      back.className = "card-back";
      back.style.position = "absolute";
      back.style.top = `${-i * 2}px`;
      back.style.left = `${-i * 2}px`;
      visual.appendChild(back);
    }
    if (remaining === 0) {
      const empty = document.createElement("div");
      empty.className = "card-back";
      visual.appendChild(empty);
    }
  }

  // ---------------------------------------------------------------------
  // Взаимодействие: тап-выбор + drag (Pointer Events -> работает и мышью, и пальцем)
  // ---------------------------------------------------------------------
  let drag = null; // { colIndex, fromIndex, cards[], ghostEls[], startX, startY, moved }

  function attachCardInteraction(el, colIndex, cardIndex) {
    el.addEventListener("pointerdown", (e) => onCardPointerDown(e, colIndex, cardIndex));
  }

  function onCardPointerDown(e, colIndex, cardIndex) {
    if (state.finished) return;
    const column = state.columns[colIndex];
    if (!isMovableRun(column, cardIndex)) {
      // не образует корректную серию -> просто мигнём, тап игнорируем
      return;
    }
    e.preventDefault();

    const runCards = column.slice(cardIndex);
    const cardEls = [];
    for (let i = cardIndex; i < column.length; i++) {
      const node = document.querySelector(
        `.card[data-col="${colIndex}"][data-index="${i}"]`
      );
      if (node) cardEls.push(node);
    }

    const rect = cardEls[0].getBoundingClientRect();

    drag = {
      colIndex,
      fromIndex: cardIndex,
      runCards,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
      ghostEls: [],
      sourceEls: cardEls,
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function ensureGhost() {
    if (drag.ghostEls.length) return;
    const layer = document.getElementById("drag-layer");
    drag.runCards.forEach((card, i) => {
      const ghost = buildCardEl(card, -1, i);
      ghost.classList.remove("selected");
      ghost.style.top = `${drag.originTop + i * parseOffsetPx()}px`;
      ghost.style.left = `${drag.originLeft}px`;
      ghost.style.width = getComputedStyle(document.documentElement).getPropertyValue("--card-w");
      layer.appendChild(ghost);
      drag.ghostEls.push(ghost);
    });
    drag.sourceEls.forEach((el) => el.classList.add("dragging-source"));
  }

  function parseOffsetPx() {
    const val = getComputedStyle(document.documentElement).getPropertyValue("--stack-offset");
    return parseFloat(val);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      ensureGhost();
    }
    if (drag.moved) {
      drag.ghostEls.forEach((ghost, i) => {
        ghost.style.top = `${drag.originTop + dy + i * parseOffsetPx()}px`;
        ghost.style.left = `${drag.originLeft + dx}px`;
      });
      highlightDropTarget(e.clientX, e.clientY);
    }
  }

  function highlightDropTarget(x, y) {
    document.querySelectorAll(".column").forEach((c) => c.classList.remove("drop-target", "drop-invalid"));
    const el = elementAtIgnoringGhost(x, y);
    const colEl = el && el.closest(".column");
    if (!colEl) return;
    const toCol = parseInt(colEl.dataset.col, 10);
    const moving = drag.runCards[0];
    const valid = toCol !== drag.colIndex && canPlace(moving, state.columns[toCol]);
    colEl.classList.add(valid ? "drop-target" : "drop-invalid");
  }

  function elementAtIgnoringGhost(x, y) {
    const layer = document.getElementById("drag-layer");
    const prevPointerEvents = layer.style.pointerEvents;
    layer.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    layer.style.pointerEvents = prevPointerEvents;
    return el;
  }

  function onPointerUp(e) {
    document.removeEventListener("pointermove", onPointerMove);
    if (!drag) return;

    document.querySelectorAll(".column").forEach((c) => c.classList.remove("drop-target", "drop-invalid"));

    if (!drag.moved) {
      // это был тап, не драг -> обработать как выбор/ход
      handleTap(drag.colIndex, drag.fromIndex);
      cleanupDrag();
      return;
    }

    const el = elementAtIgnoringGhost(e.clientX, e.clientY);
    const colEl = el && el.closest(".column");
    let success = false;
    if (colEl) {
      const toCol = parseInt(colEl.dataset.col, 10);
      success = tryMove(drag.colIndex, drag.fromIndex, toCol);
    }
    cleanupDrag();
    if (!success) {
      render(); // вернуть карты на место (перерисовать)
    }
  }

  function cleanupDrag() {
    if (drag) {
      drag.ghostEls.forEach((g) => g.remove());
    }
    drag = null;
  }

  // Тап-логика: первый тап выбирает серию, второй тап на столбце — ход,
  // повторный тап по той же карте снимает выбор.
  function handleTap(colIndex, cardIndex) {
    if (state.selection && state.selection.col === colIndex && state.selection.index === cardIndex) {
      state.selection = null;
      render();
      return;
    }
    if (state.selection) {
      const moved = tryMove(state.selection.col, state.selection.index, colIndex);
      if (moved) return;
      // если не удалось переместить на другой столбец с картой — переключим выбор
    }
    state.selection = { col: colIndex, index: cardIndex };
    render();
  }

  function attachColumnDropHandlers(colEl, colIndex) {
    colEl.addEventListener("pointerdown", (e) => {
      // тап по пустому столбцу для завершения хода при активном выборе
      if (state.columns[colIndex].length === 0 && state.selection) {
        e.stopPropagation();
        tryMove(state.selection.col, state.selection.index, colIndex);
      }
    });
  }

  // ---------------------------------------------------------------------
  // UI: кнопки, модалки
  // ---------------------------------------------------------------------
  function setUndoEnabled(enabled) {
    document.getElementById("btn-undo").disabled = !enabled;
  }

  function openModal(id) {
    document.getElementById(id).hidden = false;
  }
  function closeModal(id) {
    document.getElementById(id).hidden = true;
  }

  function initUI() {
    document.getElementById("year").textContent = new Date().getFullYear();

    document.getElementById("btn-new-game").addEventListener("click", () => openModal("modal-newgame"));
    document.getElementById("btn-cancel-newgame").addEventListener("click", () => closeModal("modal-newgame"));
    document.getElementById("btn-rules").addEventListener("click", () => openModal("modal-rules"));
    document.getElementById("btn-close-rules").addEventListener("click", () => closeModal("modal-rules"));
    document.getElementById("btn-undo").addEventListener("click", undo);

    document.querySelectorAll(".suit-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suits = parseInt(btn.dataset.suits, 10);
        closeModal("modal-newgame");
        closeModal("modal-end");
        newGame(suits);
      });
    });

    document.getElementById("btn-play-again").addEventListener("click", () => {
      closeModal("modal-end");
      openModal("modal-newgame");
    });

    document.getElementById("stock-pile").addEventListener("pointerup", () => {
      if (!drag || !drag.moved) dealFromStock();
    });

    // клавиатура: Ctrl+Z для отмены
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Запуск
  // ---------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    initUI();
    newGame(2); // партия по умолчанию — 2 масти
  });
})();
