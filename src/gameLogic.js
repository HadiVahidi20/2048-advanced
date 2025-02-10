/**
 * Game Logic Module for 2048 Advanced
 * Handles game state, moves, special operations, achievements, and in-app rewards.
 */

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { db } from "./firebaseService.js";
import {
  updateGridUI,
  updateLevelUI,
  updateCoinsUI,
  updateMovesUI,
  updateTimerUI,
  showCustomAlert,
  playSound,
  showWinModal,
  animateCell,
  animateCells
} from "./ui.js";

// ثابت‌های تنظیمات بازی
const MAX_UNDO_HISTORY = 10;
const DAILY_MISSION_GOAL = 2048;
const DAILY_MISSION_REWARD = 5;

const COST_UNDO = 5;
const COST_BOMB = 10;
const COST_SWAP = 15;
const COST_FREEZE = 20;

/**
 * تابع کمکی برای کلون عمیق آرایه.
 */
function cloneArray(arr) {
  return JSON.parse(JSON.stringify(arr));
}

export class Game {
  /**
   * ایجاد یک نمونه جدید از بازی.
   * @param {number} size - اندازه جدول (مثلاً 4 برای 4x4).
   * @param {boolean} demoMode - در صورت true، وضعیت بازی محلی ذخیره می‌شود.
   */
  constructor(size = 4, demoMode = true) {
    this.size = size;
    this.demoMode = demoMode;
    this.user = null;
    this.coins = 0;
    this.highScore = 0;
    this.score = 0;
    this.gameOver = false;
    this.winTriggered = false;
    this.undoHistory = [];
    this.dailyMission = {
      goalTile: DAILY_MISSION_GOAL,
      reward: DAILY_MISSION_REWARD,
      lastClaimedDate: null
    };
    this.frozenCells = Array(this.size * this.size).fill(false);
    this.grid = Array(this.size * this.size).fill(0);
    // حالت‌های بازی: "Classic" (پیش‌فرض)، "Timed" یا "Challenge"
    this.mode = "Classic";
    this.timerDuration = 60; // پیش‌فرض برای حالت Timed
    this.timerRemaining = this.timerDuration;
    this.timerInterval = null;
    this.moveLimit = Infinity; // برای حالت Challenge
    this.movesMade = 0;

    // ویژگی‌های اضافه شده برای دستاوردها و آیتم‌های ویژه
    this.achievements = [];
    this.inAppItems = {};
  }

  /**
   * راه‌اندازی یک بازی جدید.
   */
  initNewGame() {
    this.grid = Array(this.size * this.size).fill(0);
    this.score = 0;
    this.gameOver = false;
    this.winTriggered = false;
    this.undoHistory = [];
    this.frozenCells = Array(this.size * this.size).fill(false);
    if (this.mode === "Timed") {
      this.timerRemaining = this.timerDuration;
      this.startTimer();
    } else {
      this.stopTimer();
      updateTimerUI("");
    }
    if (this.mode === "Challenge") {
      this.movesMade = 0;
      updateMovesUI(this.moveLimit - this.movesMade);
    } else {
      updateMovesUI("");
    }
    // افزودن دو تایل تصادفی
    this.addRandomTile();
    this.addRandomTile();
    this.pushHistory();
    this.updateUI();
    this.saveState();
  }

  /**
   * تغییر اندازه جدول و راه‌اندازی مجدد بازی.
   * @param {number} newSize 
   */
  setGridSize(newSize) {
    this.size = newSize;
    this.initNewGame();
  }

  /**
   * ذخیره وضعیت فعلی برای قابلیت undo.
   */
  pushHistory() {
    if (this.undoHistory.length >= MAX_UNDO_HISTORY) {
      this.undoHistory.shift();
    }
    this.undoHistory.push({
      grid: cloneArray(this.grid),
      score: this.score,
      frozenCells: [...this.frozenCells]
    });
  }

  /**
   * انجام یک حرکت در جهت مشخص.
   * @param {string} direction - "up"، "down"، "left" یا "right"
   */
  move(direction) {
    if (this.gameOver) return;

    const oldLevel = Math.floor(this.score / 1000) + 1;
    this.pushHistory();
    const previousGrid = this.grid.join(',');

    if (direction === "up" || direction === "down") {
      this.moveVertical(direction);
    } else if (direction === "left" || direction === "right") {
      this.moveHorizontal(direction);
    }

    if (this.grid.join(',') !== previousGrid) {
      this.addRandomTile();
      if (this.score > this.highScore) {
        this.highScore = this.score;
      }
      const newLevel = Math.floor(this.score / 1000) + 1;
      if (newLevel > oldLevel) {
        const levelDiff = newLevel - oldLevel;
        this.coins += levelDiff * 2;
        showCustomAlert(`Level Up! You've gained ${levelDiff * 2} coins!`);
      }
      if (this.mode === "Challenge") {
        this.movesMade++;
        if (this.movesMade >= this.moveLimit) {
          this.gameOver = true;
          showCustomAlert("Move limit reached! Challenge over!");
        }
      }
      this.saveState();
      this.updateUI();
      this.checkDailyMission();
      this.checkGameOver();
      this.checkWin();
      // بررسی دستاوردها و اعطای پاداش ویژه
      this.checkAchievements();
      this.awardSpecialReward();
      playSound("move");
    } else {
      playSound("error");
    }
  }

  /**
   * حرکت عمودی سلول‌ها.
   * @param {string} direction - "up" یا "down"
   */
  moveVertical(direction) {
    for (let col = 0; col < this.size; col++) {
      const colIndices = [];
      const column = [];
      const frozenColumn = [];
      for (let row = 0; row < this.size; row++) {
        const idx = row * this.size + col;
        colIndices.push(idx);
        column.push(this.grid[idx]);
        frozenColumn.push(this.frozenCells[idx]);
      }
      const processed = this.processLineWithFrozen(column, frozenColumn, direction === "down");
      colIndices.forEach((idx, i) => {
        this.grid[idx] = processed[i];
      });
    }
  }

  /**
   * حرکت افقی سلول‌ها.
   * @param {string} direction - "left" یا "right"
   */
  moveHorizontal(direction) {
    for (let row = 0; row < this.size; row++) {
      const start = row * this.size;
      const rowData = this.grid.slice(start, start + this.size);
      const frozenRow = this.frozenCells.slice(start, start + this.size);
      const processed = this.processLineWithFrozen(rowData, frozenRow, direction === "right");
      for (let col = 0; col < this.size; col++) {
        this.grid[start + col] = processed[col];
      }
    }
  }

  /**
   * پردازش یک خط (ردیف یا ستون) با در نظر گرفتن سلول‌های فریز.
   * @param {Array<number>} line 
   * @param {Array<boolean>} frozen 
   * @param {boolean} reverse 
   * @returns {Array<number>}
   */
  processLineWithFrozen(line, frozen, reverse = false) {
    let originalLine = [...line];
    let originalFrozen = [...frozen];
    if (reverse) {
      line.reverse();
      frozen.reverse();
    }
    let result = [...line];

    // پردازش بخش‌های غیر فریز
    let start = 0;
    while (start < line.length) {
      if (frozen[start]) {
        start++;
        continue;
      }
      let segStart = start;
      while (start < line.length && !frozen[start]) {
        start++;
      }
      let segEnd = start;
      let segment = line.slice(segStart, segEnd);
      let processedSegment = this.processSegment(segment);
      for (let i = segStart; i < segEnd; i++) {
        result[i] = processedSegment[i - segStart];
      }
    }

    // ادغام سلول‌های مجاور در کنار سلول‌های فریز (در صورت وجود)
    for (let i = 1; i < result.length - 1; i++) {
      if (frozen[i]) {
        if (!frozen[i - 1] && !frozen[i + 1] && result[i - 1] !== 0 && result[i - 1] === result[i + 1]) {
          result[i - 1] *= 2;
          result[i + 1] = 0;
          this.score += result[i - 1];
          if (result[i - 1] >= 128) {
            this.coins += result[i - 1] >= 512 ? 2 : 1;
          }
          playSound("merge");
        }
      }
    }

    // اسلاید مجدد سلول‌های غیر فریز
    let final = [...result];
    let i = 0;
    while (i < final.length) {
      if (frozen[i]) {
        i++;
        continue;
      }
      let segStart = i;
      while (i < final.length && !frozen[i]) {
        i++;
      }
      let segEnd = i;
      let segment = final.slice(segStart, segEnd);
      let slid = this.slideLine(segment);
      for (let j = segStart; j < segEnd; j++) {
        final[j] = slid[j - segStart];
      }
    }

    if (reverse) {
      final.reverse();
    }
    return final;
  }

  /**
   * پردازش یک بخش از خط با ادغام سلول‌های برابر.
   * @param {Array<number>} segment 
   * @returns {Array<number>}
   */
  processSegment(segment) {
    let arr = segment.filter(x => x !== 0);
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        this.score += arr[i];
        if (arr[i] >= 128) {
          this.coins += arr[i] >= 512 ? 2 : 1;
        }
        arr[i + 1] = 0;
        playSound("merge");
        i++;
      }
    }
    let merged = arr.filter(x => x !== 0);
    while (merged.length < segment.length) {
      merged.push(0);
    }
    return merged;
  }

  /**
   * اسلاید کردن خط برای حذف صفرها.
   * @param {Array<number>} line 
   * @returns {Array<number>}
   */
  slideLine(line) {
    const filtered = line.filter(val => val !== 0);
    const zeros = Array(line.length - filtered.length).fill(0);
    return [...filtered, ...zeros];
  }

  /**
   * افزودن یک تایل تصادفی (مقدار 2 یا 4) به یک سلول خالی.
   */
  addRandomTile() {
    const emptyIndices = this.grid
      .map((val, index) => (val === 0 ? index : null))
      .filter(index => index !== null);
    if (emptyIndices.length === 0) return;
    const randomIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    this.grid[randomIndex] = Math.random() < 0.9 ? 2 : 4;
  }

  /**
   * بررسی و پاداش ماموریت روزانه.
   */
  checkDailyMission() {
    const today = new Date().toISOString().split("T")[0];
    if (
      (!this.dailyMission.lastClaimedDate || this.dailyMission.lastClaimedDate !== today) &&
      this.grid.some(val => val >= this.dailyMission.goalTile)
    ) {
      this.coins += this.dailyMission.reward;
      this.dailyMission.lastClaimedDate = today;
      showCustomAlert(`Daily mission complete! +${this.dailyMission.reward} coins`);
    }
  }

  /**
   * بررسی وضعیت پایان بازی.
   */
  checkGameOver() {
    if (this.grid.includes(0)) return;
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size - 1; col++) {
        if (this.grid[row * this.size + col] === this.grid[row * this.size + col + 1]) return;
      }
    }
    for (let col = 0; col < this.size; col++) {
      for (let row = 0; row < this.size - 1; row++) {
        if (this.grid[row * this.size + col] === this.grid[(row + 1) * this.size + col]) return;
      }
    }
    this.gameOver = true;
    showCustomAlert("Game Over!");
    if (this.mode === "Timed") {
      this.stopTimer();
    }
  }

  /**
   * بررسی شرط پیروزی.
   */
  checkWin() {
    if (!this.winTriggered && this.grid.some(val => val >= 2048)) {
      this.winTriggered = true;
      showWinModal();
    }
  }

  /**
   * تابع جدید: بررسی دستاوردها.
   */
  checkAchievements() {
    if (this.score >= 5000 && !this.achievements.includes("High Scorer")) {
      this.achievements.push("High Scorer");
      showCustomAlert("Achievement Unlocked: High Scorer!");
      playSound("win");
      if (!this.demoMode && this.user) {
        import("./firebaseService.js").then(({ saveAchievement }) => {
          saveAchievement(this.user.uid, { title: "High Scorer", description: "Score reached 5000+" });
        });
      }
    }
  }

  /**
   * تابع جدید: اعطای پاداش ویژه (مثلاً آیتم درون‌برنامه‌ای specialSkin).
   */
  awardSpecialReward() {
    if (this.score >= 10000 && !this.inAppItems.specialSkin) {
      this.inAppItems.specialSkin = "gold";
      showCustomAlert("Special Reward Unlocked: Gold Skin!");
      playSound("win");
      if (!this.demoMode && this.user) {
        import("./firebaseService.js").then(({ updateUserItems }) => {
          updateUserItems(this.user.uid, { specialSkin: "gold" });
        });
      }
      // به صورت اختیاری، انیمیشن ویژه برای یک سلول خاص اجرا شود
      this.inAppItems.specialSkin && animateCells([0], "special-reward-animation");
    }
  }

  /**
   * بازگشت آخرین حرکت.
   */
  undoMove() {
    if (this.undoHistory.length === 0) {
      showCustomAlert("No moves to undo!");
      return;
    }
    if (this.undoHistory.length > 1 && this.coins < COST_UNDO) {
      showCustomAlert("Not enough coins for Undo!");
      return;
    }
    if (this.undoHistory.length > 1) {
      this.coins -= COST_UNDO;
    }
    const previousState = this.undoHistory.pop();
    this.grid = previousState.grid;
    this.score = previousState.score;
    this.frozenCells = previousState.frozenCells;
    this.updateUI();
    this.saveState();
  }

  /**
   * عملیات ویژه: بمب زدن در یک سلول.
   * @param {number} cellIndex
   */
  bombAt(cellIndex) {
    if (this.coins < COST_BOMB) {
      showCustomAlert("Not enough coins for Bomb!");
      return;
    }
    this.coins -= COST_BOMB;
    this.grid[cellIndex] = 0;
    let affected = [cellIndex];
    if (cellIndex % this.size !== 0) {
      this.grid[cellIndex - 1] = 0;
      affected.push(cellIndex - 1);
    }
    if (cellIndex % this.size !== this.size - 1) {
      this.grid[cellIndex + 1] = 0;
      affected.push(cellIndex + 1);
    }
    animateCells(affected, "bomb-animation");
    playSound("bomb");
    this.saveState();
    this.updateUI();
  }

  /**
   * عملیات ویژه: سواپ دو سلول.
   * @param {number} index1 
   * @param {number} index2 
   */
  swapCells(index1, index2) {
    if (this.coins < COST_SWAP) {
      showCustomAlert("Not enough coins for Swap!");
      return;
    }
    if (this.grid[index1] === 0 || this.grid[index2] === 0) {
      showCustomAlert("Select two non-empty cells for swapping!");
      return;
    }
    this.coins -= COST_SWAP;
    [this.grid[index1], this.grid[index2]] = [this.grid[index2], this.grid[index1]];
    animateCells([index1, index2], "swap-animation");
    playSound("swap");
    this.saveState();
    this.updateUI();
  }

  /**
   * عملیات ویژه: فریز کردن یک سلول.
   * @param {number} cellIndex 
   */
  freezeCell(cellIndex) {
    if (this.coins < COST_FREEZE) {
      showCustomAlert("Not enough coins for Freeze!");
      return;
    }
    if (this.frozenCells[cellIndex]) {
      showCustomAlert("This cell is already frozen.");
      return;
    }
    this.coins -= COST_FREEZE;
    this.frozenCells[cellIndex] = true;
    animateCell(cellIndex, "freeze-animation");
    showCustomAlert("Cell frozen! This cell will not move.");
    this.saveState();
    this.updateUI();
  }

  /**
   * به‌روزرسانی رابط کاربری.
   */
  updateUI() {
    updateGridUI(this.grid, this.score, this.highScore, this.frozenCells);
    updateLevelUI(this.score);
    updateCoinsUI(this.coins);
    if (this.mode === "Timed") {
      updateTimerUI(this.timerRemaining);
      document.getElementById('timer.display').style='block'
    } else {
      updateTimerUI("");
    }
    if (this.mode === "Challenge") {
      updateMovesUI(this.moveLimit - this.movesMade);
    } else {
      updateMovesUI("");
    }
  }

  /**
   * ذخیره وضعیت بازی.
   */
  async saveState() {
    if (this.demoMode) {
      const gameData = {
        grid: this.grid,
        score: this.score,
        highScore: this.highScore,
        size: this.size,
        coins: this.coins,
        dailyMission: this.dailyMission,
        frozenCells: this.frozenCells
      };
      localStorage.setItem("guestGameData", JSON.stringify(gameData));
    } else if (this.user) {
      try {
        await this.saveUserProfile();
        const gameState = {
          grid: this.grid,
          score: this.score,
          highScore: this.highScore,
          size: this.size,
          timestamp: Date.now()
        };
        const gameDoc = doc(db, "gameStates", this.user.uid);
        await setDoc(gameDoc, gameState);
      } catch (error) {
        console.error("Error saving game state:", error);
      }
    }
  }

  /**
   * بارگذاری وضعیت بازی.
   */
  async loadState() {
    if (this.demoMode) {
      const dataStr = localStorage.getItem("guestGameData");
      if (!dataStr) return;
      try {
        const data = JSON.parse(dataStr);
        if (data && Array.isArray(data.grid)) {
          this.grid = data.grid;
          this.score = data.score;
          this.highScore = data.highScore;
          this.size = data.size;
          this.coins = data.coins;
          this.dailyMission = data.dailyMission;
          this.frozenCells = data.frozenCells || Array(this.size * this.size).fill(false);
        }
      } catch (error) {
        console.warn("Failed to parse guest game data.");
      }
    } else if (this.user) {
      try {
        const gameDoc = doc(db, "gameStates", this.user.uid);
        const snap = await getDoc(gameDoc);
        if (snap.exists()) {
          const data = snap.data();
          this.grid = data.grid || this.grid;
          this.score = data.score || 0;
          this.size = data.size || 4;
          if (data.highScore && data.highScore > this.highScore) {
            this.highScore = data.highScore;
          }
        } else {
          this.initNewGame();
        }
      } catch (error) {
        console.error("Error loading game state:", error);
      }
    }
    this.updateUI();
  }

  /**
   * ذخیره پروفایل کاربر (coins، highScore و dailyMission).
   */
  async saveUserProfile() {
    if (!this.user) return;
    try {
      const userDoc = doc(db, "users", this.user.uid);
      await setDoc(
        userDoc,
        {
          coins: this.coins,
          highScore: this.highScore,
          dailyMission: {
            lastClaimedDate: this.dailyMission.lastClaimedDate || null
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error saving user profile:", error);
    }
  }

  /**
   * شروع تایمر برای حالت Timed.
   */
  startTimer() {
    this.stopTimer();
    this.timerRemaining = this.timerDuration;
    updateTimerUI(this.timerRemaining);
    this.timerInterval = setInterval(() => {
      this.timerRemaining--;
      updateTimerUI(this.timerRemaining);
      if (this.timerRemaining <= 0) {
        this.stopTimer();
        this.gameOver = true;
        showCustomAlert("Time's up! Game Over!");
      }
    }, 1000);
  }

  /**
   * توقف تایمر.
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
