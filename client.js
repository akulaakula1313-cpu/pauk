(function () {
  "use strict";

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

  let state = null;
  let history = [];
  let timerHandle = null;
  let startTime = null;
  let hintTimeout = null;

  // Компоненты плеера фоновой музыки
  const audioEl = document.getElementById("bg-audio");
  const musicUpload = document.getElementById("music-upload");
  const musicLabel = document.getElementById("music-label");
  const btnMute = document.getElementById("btn-mute");

  musicUpload.addEventListener("change", function(e) {
    const file = e.target.files;
    if (file) {
      const url = URL.createObjectURL(file);
      audioEl.src = url;
      audioEl.play().catch(err => console.log("Интерактивное требование автоплея:", err));
      musicLabel.textContent = "🎵 " + file.name.substring(0, 10) + "...";
      btnMute.style.display = "inline-block";
      btnMute.textContent = "🔊";
    }
  });

  btnMute.addEventListener("click", function() {
    if (audioEl.paused) {
      audioEl.play();
      btnMute.textContent = "🔊";
    } else {
      audioEl.pause();
      btnMute.textContent = "🔇";
    }
  });

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

  function newGame(numSuits) {
    clearHintHighlight();
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

    const stockDeals = [];
    while (deck.length) {
      stockDeals.push(deck.splice(0, 10));
    }

    state = {
      numSuits,
      columns,
      stockDeals,
      completed: 0,
      moves: 0,
      selection: null,
      finished: false,
    };
    history = [];
    updateDifficultyLabel(numSuits);
    resetTimer();
    render();
    setUndoEnabled(false);
    document.getElementById("start-screen").hidden = true;
  }

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
    clearHintHighlight();
    const snap = history.pop();
    state.columns = snap.columns;
    state.stockDeals = snap.stockDeals;
    state.completed = snap.completed;
    state.moves = snap.moves;
    state.selection = null;
    setUndoEnabled(history.length > 0);
    render();
  }

  function tryMove(fromCol, fromIndex, toCol) {
    if (fromCol === toCol) return false;
    const source = state.columns[fromCol];
    const target = state.columns[toCol];
    if (fromIndex < 0 || fromIndex >= source.length) return false;
    if (!isMovableRun(source, fromIndex)) return false;

    const moving = source[fromIndex];
    if (!canPlace(moving, target)) return false;

    clearHintHighlight();
    pushHistory();

    const run = source.splice(fromIndex, source.length - fromIndex);
    target.push(...run);

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

  function checkSequenceComplete(colIndex) {
    const col = state.columns[colIndex];
    if (col.length < 13) return;
    const slice = col.slice(col.length - 13);
    const suit = slice.suit;
    let ok = slice.rank === 13;
    for (let i = 0; ok && i < 13; i++) {
      if (slice[i].suit !== suit || slice[i].rank !== 13 - i) ok = false;
    }
    if (!ok) return;

    col.splice(col.length - 13, 13);
    if (col.length) col[col.length - 1].faceUp = true;
    state.completed++;
    render();
  }

  function dealFromStock() {
    if (state.finished) return;
    if (!state.stockDeals.length) return;
    
    if (state.columns.some((c) => c.length === 0)) {
      alert("Нельзя раздавать карты, пока на поле есть пустые столбцы!");
      return;
    }
    
    clearHintHighlight();
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

  function getBestMove() {
    let possibleMoves = [];

    for (let c = 0; c < COLS; c++) {
      const col = state.columns[c];
      for (let i = col.length - 1; i >= 0; i--) {
        if (!col[i].faceUp) break;
        if (!isMovableRun(col, i)) continue;

        const movingCard = col[i];

        for (let t = 0; t < COLS; t++) {
          if (t === c) continue;
          if (canPlace(movingCard, state.columns[t])) {
            const targetCol = state.columns[t];
            let score = 0;

            if (targetCol.length > 0 && targetCol[targetCol.length - 1].suit === movingCard.suit) {
              score += 10;
            }
            if (i > 0 && !col[i - 1].faceUp) {
              score += 5;
            }
            if (targetCol.length === 0) {
              score += 2;
            }

            possibleMoves.push({ fromCol: c, fromIndex: i, toCol: t, score: score });
          }
        }
      }
    }

    if (possibleMoves.length === 0) return null;
    possibleMoves.sort((a, b) => b.score - a.score);
    return possibleMoves;
  }

  function showHint() {
    clearHintHighlight();
    const hint = getBestMove();
    if (!hint) {
      alert("Доступных ходов нет! Нажмите «Новая раздача» внизу экрана.");
      return;
    }

    const sourceCardEl = document.querySelector(`.card[data-col="${hint.fromCol}"][data-index="${hint.fromIndex}"]`);
    if (sourceCardEl) sourceCardEl.classList.add("hint-highlight");

    const targetColEl = document.querySelectorAll(".column")[hint.toCol];
    if (targetColEl) targetColEl.classList.add("hint-target-column");

    hintTimeout = setTimeout(clearHintHighlight, 4000);
  }

  function clearHintHighlight() {
    if (hintTimeout) clearTimeout(hintTimeout);
    document.querySelectorAll(".card").forEach(el => el.classList.remove("hint-highlight"));
    document.querySelectorAll(".column").forEach(el => el.classList.remove("hint-target-column"));
  }

  function hasAnyLegalMove() {
    if (state.columns.some((c) => c.length === 0)) return true;
    return getBestMove() !== null;
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
      ? "Все восемь последовательностей собраны!"
      : "Больше нет доступных ходов и карт в колоде.";
    document.getElementById("end-moves").textContent = state.moves;
    document.getElementById("end-time").textContent = formatTime(elapsedSeconds());
    overlay.hidden = false;
  }

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

  function render() {
    renderTableau();
    document.getElementById("stat-moves").textContent = state.moves;
    document.getElementById("stat-sequences").innerHTML = `${state.completed}<i>/8</i>`;
    document.getElementById("stat-stock").textContent = state.stockDeals.length;
    
    const dealBtn = document.getElementById("btn-deal-deck");
    if (state.stockDeals.length === 0 || state.finished) {
      dealBtn.disabled = true;
    } else {
      dealBtn.disabled = false;
    }
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

      colEl.addEventListener("pointerdown", (e) => {
        if (state.columns[colIndex].length === 0 && state.selection) {
          e.stopPropagation();
          tryMove(state.selection.col, state.selection.index, colIndex);
        }
      });

      tableau.appendChild(colEl);
    });
  }

  function buildCardEl(card, colIndex, cardIndex) {
    const el = document.createElement("div");
    el.className = "card " + (card.color === "red" ? "is-red" : "is-black");
    el.dataset.col = colIndex;
    el.dataset.index = cardIndex;
    el.dataset.id = card.id;

    const isSel = state.selection && state.selection.col === colIndex && state.selection.index === cardIndex;

    if (card.faceUp) {
      el.innerHTML = `
        <div class="card-face">
          <div class="corner top"><span>${RANK_NAMES[card.rank]}</span><span>${card.glyph}</span></div>
          <div class="pip">${card.glyph}</div>
          <div class="corner bottom"><span>${RANK_NAMES[card.rank]}</span><span>${card.glyph}</span></div>
        </div>`;
      
      el.addEventListener("pointerdown", (e) => {
        if (state.finished) return;
        if (!isMovableRun(state.columns[colIndex], cardIndex)) return;
        e.preventDefault();
        e.stopPropagation();
        handleTap(colIndex, cardIndex);
      });
    } else {
      el.innerHTML = `<div class="card-back"></div>`;
    }

    if (isSel) el.classList.add("selected");
    return el;
  }

  function handleTap(colIndex, cardIndex) {
    if (state.selection && state.selection.col === colIndex && state.selection.index === cardIndex) {
      state.selection = null;
      render();
      return;
    }
    if (state.selection) {
      const moved = tryMove(state.selection.col, state.selection.index, colIndex);
      if (moved) return;
    }
    state.selection = { col: colIndex, index: cardIndex };
    render();
  }

  function setUndoEnabled(enabled) {
    document.getElementById("btn-undo").disabled = !enabled;
  }

  function initUI() {
    document.getElementById("year").textContent = new Date().getFullYear();

    document.getElementById("btn-hint").addEventListener("click", showHint);
    document.getElementById("btn-undo").addEventListener("click", undo);
    
    document.getElementById("btn-menu").addEventListener("click", () => {
      document.getElementById("start-screen").hidden = false;
    });

    document.querySelectorAll(".btn-menu-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suits = parseInt(btn.dataset.suits, 10);
        newGame(suits);
      });
    });

    document.getElementById("btn-play-again").addEventListener("click", () => {
      document.getElementById("modal-end").hidden = true;
      document.getElementById("start-screen").hidden = false;
    });

    document.getElementById("btn-deal-deck").addEventListener("click", dealFromStock);

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initUI();
    document.getElementById("start-screen").hidden = false;
  });
})();