import {
  auth,
  updateUserProfile,
  uploadAvatar,
  getUserProfile,
  getTopLeaderboard,
  isUsernameUnique
} from "./firebaseService.js";

// پیش‌بارگذاری صداها
const audioCache = {
  move: new Audio("sounds/move.mp3"),
  merge: new Audio("sounds/merge.mp3"),
  win: new Audio("sounds/win.mp3"),
  error: new Audio("sounds/error.mp3"),
  bomb: new Audio("sounds/bomb.mp3"),
  swap: new Audio("sounds/swap.mp3")
};

let currentSpecialMode = null; // "bomb"، "swap" یا "freeze"
let selectedSwapCells = [];

/**
 * تنظیم و راه‌اندازی رویدادهای رابط کاربری.
 */
export function initUI() {
  // مدیریت بسته شدن مدال‌ها با event delegation
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("close-modal")) {
      const modalId = event.target.getAttribute("data-modal");
      document.getElementById(modalId).style.display = "none";
    }
  });

  // مدال‌های ورود و ثبت‌نام
  const loginModalBtn = document.getElementById("login-modal-btn");
  const registerModalBtn = document.getElementById("register-modal-btn");
  const loginModal = document.getElementById("login-modal");
  const registerModal = document.getElementById("register-modal");

  loginModalBtn?.addEventListener("click", () => {
    loginModal.style.display = "flex";
  });
  registerModalBtn?.addEventListener("click", () => {
    registerModal.style.display = "flex";
  });

  document.getElementById("login-submit-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;
    try {
      const { login } = await import("./firebaseService.js");
      await login(email, password);
      loginModal.style.display = "none";
    } catch (err) {
      alert("Login error: " + err.message);
    }
  });

  document.getElementById("register-submit-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    if (!email || !password) return;
    try {
      const { register } = await import("./firebaseService.js");
      await register(email, password);
      registerModal.style.display = "none";
    } catch (err) {
      alert("Registration error: " + err.message);
    }
  });

  // مدال بازی جدید
  const newGameBtn = document.getElementById("new-game-btn");
  const newGameModal = document.getElementById("newgame-modal");
  const startNewGameBtn = document.getElementById("start-newgame-btn");

  newGameBtn?.addEventListener("click", () => {
    newGameModal.style.display = "flex";
  });

  const modeCards = document.querySelectorAll(".mode-card");
  modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      modeCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });
  const sizeCards = document.querySelectorAll(".size-card");
  sizeCards.forEach((card) => {
    card.addEventListener("click", () => {
      sizeCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });

  // خواندن نوع بازی و اندازه جدول در بازی جدید
  startNewGameBtn?.addEventListener("click", () => {
    const selectedModeCard = document.querySelector(".mode-card.active");
    if (!selectedModeCard) {
      showCustomAlert("Please select a game mode.");
      return;
    }
    const selectedSizeCard = document.querySelector(".size-card.active");
    if (!selectedSizeCard) {
      showCustomAlert("Please select a grid size.");
      return;
    }
    const gridSize = parseInt(selectedSizeCard.getAttribute("data-size"), 10);
    let selectedMode = selectedModeCard.getAttribute("data-mode");
    if (selectedMode === "MoveChallenge") {
      selectedMode = "Challenge";
    }
    if (window.gameInstance) {
      window.gameInstance.mode = selectedMode;
      if (selectedMode === "Timed") {
        window.gameInstance.timerDuration = 120; // 2 دقیقه
      } else if (selectedMode === "Challenge") {
        window.gameInstance.moveLimit = 100; // 100 حرکت محدود
        window.gameInstance.movesMade = 0;
      }
      window.gameInstance.setGridSize(gridSize);
      window.gameInstance.initNewGame();
    }
    newGameModal.style.display = "none";
  });

  // پشتیبانی از صفحه‌کلید و لمس برای حرکت‌ها
  document.addEventListener("keydown", handleKeyDown);
  addSwipeSupport();

  // ناوبری به صفحه پروفایل
  const avatarElem = document.getElementById("avatar");
  avatarElem?.addEventListener("click", () => {
    document.getElementById("game-app").hidden = true;
    document.getElementById("profile-page").hidden = false;
    loadProfileSettings();
  });

  // دکمه‌های ویژه: Undo، Bomb، Swap، Freeze
  document.getElementById("undo-btn")?.addEventListener("click", () => {
    window.gameInstance?.undoMove();
  });

  document.getElementById("bomb-btn")?.addEventListener("click", () => {
    currentSpecialMode = "bomb";
    showCustomAlert("Select a cell to bomb. The selected cell and its left and right neighbors will be cleared.");
  });

  document.getElementById("swap-btn")?.addEventListener("click", () => {
    currentSpecialMode = "swap";
    selectedSwapCells = [];
    showCustomAlert("Select two non-empty cells to swap.");
  });

  document.getElementById("freeze-btn")?.addEventListener("click", () => {
    currentSpecialMode = "freeze";
    showCustomAlert("Select a cell to freeze. The selected cell will not move.");
  });

  // مدال‌های Leaderboard، Daily Mission و Help
  document.getElementById("leaderboard-btn")?.addEventListener("click", async () => {
    document.getElementById("leaderboard-modal").style.display = "flex";
    await showLeaderboardModal();
  });
  document.getElementById("leaderboard-ok-btn")?.addEventListener("click", () => {
    document.getElementById("leaderboard-modal").style.display = "none";
  });

  document.getElementById("daily-btn")?.addEventListener("click", () => {
    document.getElementById("daily-modal").style.display = "flex";
  });
  document.getElementById("daily-mission-ok-btn")?.addEventListener("click", () => {
    document.getElementById("daily-modal").style.display = "none";
  });

  document.getElementById("help-btn")?.addEventListener("click", () => {
    document.getElementById("help-modal").style.display = "flex";
  });
  document.getElementById("help-ok-btn")?.addEventListener("click", () => {
    document.getElementById("help-modal").style.display = "none";
  });

  // حذف تبلیغات
  document.getElementById("remove-ads-btn")?.addEventListener("click", async () => {
    const cost = 50;
    const user = auth.currentUser;
    if (!user) {
      showCustomAlert("You must be logged in to remove ads.");
      return;
    }
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      showCustomAlert("No user profile found!");
      return;
    }
    if (profile.adsRemoved) {
      showCustomAlert("Ads already removed!");
      return;
    }
    if ((profile.coins || 0) < cost) {
      showCustomAlert("Not enough coins to remove ads!");
      return;
    }
    await updateUserProfile(user.uid, {
      coins: (profile.coins - cost),
      adsRemoved: true
    });
    hideAds();
    showCustomAlert("Ads removed! Enjoy!");
  });

  // خروج از حساب کاربری
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
      const { logout } = await import("./firebaseService.js");
      await logout();
    } catch (err) {
      alert("Logout error: " + err.message);
    }
  });

  // بازگشت از صفحه پروفایل به بازی
  document.getElementById("back-to-game-btn")?.addEventListener("click", () => {
    document.getElementById("profile-page").hidden = true;
    document.getElementById("game-app").hidden = false;
  });

  // تغییر تم
  const themeButtons = document.querySelectorAll(".theme-btn");
  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedTheme = btn.getAttribute("data-theme");
      applyTheme(selectedTheme);
    });
  });

  document.getElementById("save-settings-btn")?.addEventListener("click", handleSaveSettings);
  document.getElementById("avatar-input")?.addEventListener("change", handleAvatarChange);
}

/**
 * به‌روزرسانی رابط کاربری جدول بازی.
 */
export function updateGridUI(grid, currentScore, currentHighScore, frozenCells) {
  const gridContainer = document.getElementById("grid-container");
  const scoreElem = document.getElementById("score");
  const highScoreElem = document.getElementById("high-score");

  if (!gridContainer) return;
  gridContainer.innerHTML = "";
  const gridSize = Math.sqrt(grid.length);
  gridContainer.className = "grid-container";
  if (gridSize === 5) gridContainer.classList.add("size-5");
  grid.forEach((val, i) => {
    const cell = document.createElement("div");
    cell.classList.add("grid-cell");
    cell.dataset.index = String(i);
    cell.textContent = val === 0 ? "" : String(val);
    if (val > 0) {
      cell.classList.add("tile-" + val);
    }
    if (frozenCells && frozenCells[i]) {
      cell.classList.add("frozen-cell");
    }
    // رویداد کلیک سلول برای حالت‌های ویژه
    cell.addEventListener("click", () => {
      if (currentSpecialMode === "bomb") {
        window.gameInstance?.bombAt(i);
        currentSpecialMode = null;
      } else if (currentSpecialMode === "swap") {
        if (val === 0) {
          showCustomAlert("Please select a non-empty cell for swapping.");
          return;
        }
        cell.classList.add("selected-swap");
        selectedSwapCells.push(i);
        if (selectedSwapCells.length === 2) {
          window.gameInstance?.swapCells(selectedSwapCells[0], selectedSwapCells[1]);
          clearSwapSelection();
          currentSpecialMode = null;
          selectedSwapCells = [];
        }
      } else if (currentSpecialMode === "freeze") {
        window.gameInstance?.freezeCell(i);
        currentSpecialMode = null;
      }
    });
    gridContainer.appendChild(cell);
  });
  if (scoreElem) scoreElem.textContent = String(currentScore);
  if (highScoreElem) highScoreElem.textContent = String(currentHighScore);
}

/**
 * حذف هایلایت سلول‌های انتخاب شده برای سواپ.
 */
function clearSwapSelection() {
  document.querySelectorAll(".grid-cell.selected-swap").forEach(cell => {
    cell.classList.remove("selected-swap");
  });
}

/**
 * به‌روزرسانی سطح و XP.
 */
export function updateLevelUI(score) {
  const levelElem = document.getElementById("user-level");
  const xpFill = document.getElementById("xp-fill");
  const xpInfo = document.getElementById("xp-info");
  const level = Math.floor(score / 1000) + 1;
  const xp = score % 1000;
  const xpNext = 1000;
  if (levelElem) levelElem.textContent = String(level);
  if (xpFill) xpFill.style.width = (xp / xpNext) * 100 + "%";
  if (xpInfo) xpInfo.textContent = `${xp} / ${xpNext} XP`;
}

/**
 * به‌روزرسانی تعداد سکه‌ها.
 */
export function updateCoinsUI(coins) {
  const coinElem = document.getElementById("user-coins");
  if (coinElem) coinElem.textContent = String(coins);
}

/**
 * به‌روزرسانی نمایش تایمر (برای حالت Timed).
 */
export function updateTimerUI(time) {
  const timerElem = document.getElementById("timer-display");
  if (timerElem) {
    timerElem.textContent = time !== "" ? `Time: ${time}s` : "";
  }
}

/**
 * به‌روزرسانی نمایش تعداد حرکات (برای حالت Challenge).
 */
export function updateMovesUI(movesRemaining) {
  const movesElem = document.getElementById("moves-display");
  if (movesElem) {
    movesElem.textContent = movesRemaining !== "" ? `Moves Left: ${movesRemaining}` : "";
  }
}

/**
 * نمایش یک مدال هشدار سفارشی.
 */
export function showCustomAlert(message) {
  const modal = document.getElementById("custom-modal");
  if (!modal) return;
  const modalText = document.getElementById("modal-text");
  const modalOkBtn = document.getElementById("modal-ok-btn");
  if (modalText) modalText.textContent = message;
  modal.style.display = "flex";
  const hide = () => {
    modal.style.display = "none";
  };
  modalOkBtn.addEventListener("click", hide, { once: true });
}

/**
 * پنهان کردن تبلیغات.
 */
export function hideAds() {
  const topAd = document.getElementById("top-ad-banner");
  const bottomAd = document.getElementById("bottom-ad-banner");
  if (topAd) topAd.style.display = "none";
  if (bottomAd) bottomAd.style.display = "none";
}

/**
 * نمایش تبلیغات.
 */
export function showAds() {
  const topAd = document.getElementById("top-ad-banner");
  const bottomAd = document.getElementById("bottom-ad-banner");
  if (topAd) topAd.style.display = "block";
  if (bottomAd) bottomAd.style.display = "block";
}

/**
 * نمایش مدال leaderboard.
 */
export async function showLeaderboardModal() {
  const lbList = document.getElementById("leaderboard-list");
  if (!lbList) return;
  lbList.innerHTML = "";
  const top5 = await getTopLeaderboard(5);
  top5.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.username} - ${item.score}`;
    lbList.appendChild(li);
  });
}

/**
 * بارگذاری تنظیمات پروفایل از Firestore.
 */
async function loadProfileSettings() {
  const user = auth.currentUser;
  if (!user) return;
  const profile = await getUserProfile(user.uid);
  if (!profile) return;
  const usernameInput = document.getElementById("username-input");
  if (usernameInput && profile.username) {
    usernameInput.value = profile.username;
    usernameInput.dataset.originalUsername = profile.username;
  }
}

/**
 * ذخیره تنظیمات پروفایل.
 */
async function handleSaveSettings() {
  const user = auth.currentUser;
  if (!user) return;
  const usernameInput = document.getElementById("username-input");
  const newUsername = usernameInput.value.trim();
  const originalUsername = usernameInput.dataset.originalUsername || "";
  if (!newUsername) {
    showCustomAlert("Username cannot be empty.");
    return;
  }
  if (newUsername !== originalUsername) {
    const unique = await isUsernameUnique(newUsername);
    if (!unique) {
      showCustomAlert("This username is already taken. Please choose another.");
      return;
    }
  }
  await updateUserProfile(user.uid, { username: newUsername });
  const usernameDisplay = document.getElementById("username-display");
  if (usernameDisplay) {
    usernameDisplay.textContent = newUsername;
  }
  usernameInput.dataset.originalUsername = newUsername;
  showCustomAlert("Settings saved successfully.");
}

/**
 * پردازش تغییر تصویر پروفایل.
 */
async function handleAvatarChange(e) {
  const file = e.target.files[0];
  const user = auth.currentUser;
  if (user && file) {
    try {
      const url = await uploadAvatar(user.uid, file);
      const avatarElem = document.getElementById("avatar");
      if (avatarElem) {
        avatarElem.setAttribute("src", url + "?t=" + new Date().getTime());
      }
      showCustomAlert("Profile picture updated successfully.");
    } catch (err) {
      showCustomAlert("Error uploading image: " + err.message);
    }
  }
}

/**
 * اعمال تم انتخاب شده.
 */
function applyTheme(themeClass) {
  document.body.className = "";
  document.body.classList.add(themeClass);
}

/**
 * پخش افکت صوتی.
 */
export function playSound(type) {
  const sound = audioCache[type];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(err => console.error("Sound play error:", err));
  }
}

/**
 * نمایش مدال پیروزی.
 */
export function showWinModal() {
  const winModal = document.getElementById("win-modal");
  if (winModal) {
    winModal.style.display = "flex";
    const hideModal = () => {
      winModal.style.display = "none";
    };
    document.getElementById("win-ok-btn")?.addEventListener("click", hideModal, { once: true });
    playSound("win");
  }
}

/**
 * پردازش رویدادهای صفحه‌کلید برای حرکت‌ها.
 */
function handleKeyDown(e) {
  const allowedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (!allowedKeys.includes(e.key)) return;
  e.preventDefault();
  switch (e.key) {
    case "ArrowUp":
      window.gameInstance?.move("up");
      break;
    case "ArrowDown":
      window.gameInstance?.move("down");
      break;
    case "ArrowLeft":
      window.gameInstance?.move("left");
      break;
    case "ArrowRight":
      window.gameInstance?.move("right");
      break;
  }
}

/**
 * اضافه کردن پشتیبانی از لمس (Swipe) برای دستگاه‌های موبایل.
 */
function addSwipeSupport() {
  let touchStartX = 0, touchStartY = 0;
  const threshold = 50;
  document.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].screenX;
    touchStartY = event.changedTouches[0].screenY;
  }, false);
  document.addEventListener("touchend", (event) => {
    const touchEndX = event.changedTouches[0].screenX;
    const touchEndY = event.changedTouches[0].screenY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (Math.abs(diffX) > threshold) {
        diffX > 0 ? window.gameInstance?.move("right") : window.gameInstance?.move("left");
      }
    } else {
      if (Math.abs(diffY) > threshold) {
        diffY > 0 ? window.gameInstance?.move("down") : window.gameInstance?.move("up");
      }
    }
  }, false);
}

/**
 * انیمیت یک سلول با کلاس انیمیشنی مشخص.
 */
export function animateCell(index, animationClass) {
  const cell = document.querySelector(`.grid-cell[data-index="${index}"]`);
  if (cell) {
    cell.classList.add(animationClass);
    setTimeout(() => {
      cell.classList.remove(animationClass);
    }, 1000);
  }
}

/**
 * انیمیت چندین سلول.
 */
export function animateCells(indices, animationClass) {
  indices.forEach(index => animateCell(index, animationClass));
}

/**
 * تابع جدید: انیمیت پاداش ویژه (مثلاً با افکت «special-reward-animation»).
 */
export function animateSpecialReward(index) {
  animateCell(index, "special-reward-animation");
}
