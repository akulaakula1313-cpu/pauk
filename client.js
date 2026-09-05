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

  const audioEl = document.getElementById("bg-audio");
  const musicUpload = document.getElementById("music-upload");
  const musicLabel = document.getElementById("music-label");
  const btnMute = document.getElementById("btn-mute");

  if (musicUpload) {
    musicUpload.addEventListener("change", function(e) {
      const file = e.target.files;
      if (file && file[0]) {
        const url = URL.createObjectURL(file[0]);
        audioEl.src = url;
        audioEl.play().catch(err => console.log("Audio play blocked:", err));
        musicLabel.textContent = "🎵 " + file[0].name.substring(0, 10) + "...";
        btnMute.style.display = "inline-block";
        btnMute.textContent = "🔊";
      }
    });
  }

  if (btnMute) {
    btnMute.addEventListener("click", function() {
      if (audioEl.paused) {
        audioEl.play();
        btnMute.textContent = "🔊";
      } else {
        audioEl.pause();
        btnMute.textContent = "🔇";
      }
    });
  }

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
    
    hideEndModal();
    document.getElementById("start-screen").style.display = "none";
    
    updateDifficultyLabel(numSuits);
    resetTimer();
    render();
    setUndoEnabled(false);
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
    if (!state || !history.length || state.finished) return;
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
    if (!state || fromCol === toCol) return false;
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
    if (!state) return;
    const col = state.columns[colIndex];
    if (col.length < 13) return;
    
    // Ищем упорядоченную последовательность от К до А одной масти с конца колонки
    for (let i = col.length - 13; i <= col.length - 1; i++) {
      if (!col[i].faceUp) return;
    }
    
    const slice = col.slice(col.length - 13);
    const suit = slice[0].suit;
    let ok = slice[0].rank === 13; // К
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
    if (!state || state.finished) return;
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
    if (!state) return null;
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
    if (!state) return false;
    if (state.columns.some((c) => c.length === 0)) return true;
    return getBestMove() !== null;
  }

  function checkGameEnd() {
    if (!state) return;
    if (state.completed >= TOTAL_SEQUENCES) {
      finishGame(true);
      return;
    }
    if (!state.stockDeals.length && !hasAnyLegalMove()) {
      finishGame(false);
    }
  }

  function finishGame(won) {
    if (!state) return;
    state.finished = true;
    stopTimer();
    const overlay = document.getElementById("modal-end");
    if (overlay) {
      overlay.style.setProperty("display", "flex", "important");
    }
    document.getElementById("end-icon").textContent = won ? "🏆" : "🕸️";
    document.getElementById("end-title").textContent = won ? "Победа!" : "Игра окончена";
    document.getElementById("end-sub").textContent = won
      ? "Все восемь последовательностей собраны!"
      : "Больше нет доступных ходов и карт в колоде.";
    document.getElementById("end-moves").textContent = state.moves;
    document.getElementById("end-time").textContent = formatTime(elapsedSeconds());
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
    if (!startTime) return 0;
    return Math.floor((Date.now() - startTime) / 1000);
  }
  
  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }
  
  function render() {
    if (!state) return;
    renderTableau();
    document.getElementById("stat-moves").textContent = state.moves;
    document.getElementById("stat-sequences").innerHTML = state.completed + "/8";
    document.getElementById("stat-stock").textContent = state.stockDeals.length;
    const dealBtn = document.getElementById("btn-deal-deck");
    if (dealBtn) {
      if (state.stockDeals.length === 0 || state.finished) {
        dealBtn.disabled = true;
      } else {
        dealBtn.disabled = false;
      }
    }
  }
  
  function updateDifficultyLabel(numSuits) {
    const label = numSuits === 1 ? "1 масть" : numSuits === 2 ? "2 масти" : "4 масти";
    document.getElementById("stat-difficulty").textContent = label;
  }
  
  function renderTableau() {
    const tableau = document.getElementById("tableau");
    if (!tableau || !state) return;
    tableau.innerHTML = "";
    
    state.columns.forEach((col, colIndex) => {
      const colEl = document.createElement("div");
      colEl.className = "column";
      colEl.dataset.col = colIndex;
      
      const height = col.length ? "calc(var(--card-h) + " + (col.length - 1) + " * var(--stack-offset))" : "var(--card-h)";
      colEl.style.minHeight = height;
      
      col.forEach((card, cardIndex) => {
        const cardEl = buildCardEl(card, colIndex, cardIndex);
        cardEl.style.top = "calc(" + cardIndex + " * var(--stack-offset))";
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
    
    const isSel = state.selection && state.selection.col === colIndex && cardIndex >= state.selection.index;
    
    if (card.faceUp) {
      el.innerHTML = '<div class="card-face">' +
        '<div class="corner top"><span>' + RANK_NAMES[card.rank] + '</span><span>' + card.glyph + '</span></div>' +
        '<div class="pip">' + card.glyph + '</div>' +
        '<div class="corner bottom"><span>' + RANK_NAMES[card.rank] + '</span><span>' + card.glyph + '</span></div>' +
        '</div>';
        
      el.addEventListener("pointerdown", (e) => {
        if (state.finished) return;
        if (!isMovableRun(state.columns[colIndex], cardIndex)) return;
        e.preventDefault();
        e.stopPropagation();
        handleTap(colIndex, cardIndex);
      });
    } else {
      el.innerHTML = '<div class="card-back"></div>';
    }
    
    if (state.selection && state.selection.col === colIndex && state.selection.index === cardIndex) {
      el.classList.add("selected");
    }
    if (isSel) {
      el.classList.add("selected-run");
    }
    
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
    const btn = document.getElementById("btn-undo");
    if (btn) btn.disabled = !enabled;
  }
  
  function hideEndModal() {
    const endModal = document.getElementById("modal-end");
    if (endModal) {
      endModal.style.setProperty("display", "none", "important");
    }
  }
  
  function initUI() {
    const btnHint = document.getElementById("btn-hint");
    if (btnHint) btnHint.addEventListener("click", showHint);
    
    const btnUndo = document.getElementById("btn-undo");
    if (btnUndo) btnUndo.addEventListener("click", undo);
    
    const btnMenu = document.getElementById("btn-menu");
    if (btnMenu) {
      btnMenu.addEventListener("click", () => {
        const startScr = document.getElementById("start-screen");
        if (startScr) startScr.style.display = "flex";
      });
    }
    
    document.querySelectorAll(".btn-menu-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suits = parseInt(btn.dataset.suits, 10);
        newGame(suits);
      });
    });
    
    const btnPlayAgain = document.getElementById("btn-play-again");
    if (btnPlayAgain) {
      btnPlayAgain.addEventListener("click", () => {
        hideEndModal();
        const startScr = document.getElementById("start-screen");
        if (startScr) startScr.style.display = "flex";
      });
    }
    
    const btnDeal = document.getElementById("btn-deal-deck");
    if (btnDeal) btnDeal.addEventListener("click", dealFromStock);
    
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    });
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    initUI();
    hideEndModal();
    const startScr = document.getElementById("start-screen");
    if (startScr) startScr.style.display = "flex";
  });
})();
