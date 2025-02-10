import {
  initFirebase,
  onAuthStateChangedHandler,
  loginAsGuest,
  loginWithGoogle,
  logout,
  getUserProfile
} from "./firebaseService.js";
import { Game } from "./gameLogic.js";
import { initUI, hideAds, showAds, updateCoinsUI, showCustomAlert } from "./ui.js";

initFirebase();
initUI();

const views = {
  landing: document.getElementById("landing-page"),
  game: document.getElementById("game-app"),
  profile: document.getElementById("profile-page")
};

const adBanners = {
  top: document.getElementById("top-ad-banner"),
  bottom: document.getElementById("bottom-ad-banner")
};

function switchView(viewName) {
  Object.keys(views).forEach(key => {
    views[key].hidden = (key !== viewName);
  });
}

let gameInstance = null;

onAuthStateChangedHandler(async (user) => {
  if (user) {
    switchView("game");
    gameInstance = new Game(4, false);
    gameInstance.user = user;
    const profile = await getUserProfile(user.uid);
    if (profile) {
      gameInstance.coins = profile.coins || 0;
      gameInstance.highScore = profile.highScore || 0;
      gameInstance.dailyMission.lastClaimedDate = profile.dailyMission?.lastClaimedDate || null;
      profile.adsRemoved ? hideAds() : showAds();
    }
    await gameInstance.loadState();
  } else {
    switchView("landing");
    gameInstance = new Game(4, true);
    gameInstance.initNewGame();
  }
  window.gameInstance = gameInstance;
});

document.getElementById("google-login-btn")?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    alert("Google login error: " + err.message);
  }
});

document.getElementById("guest-login-btn")?.addEventListener("click", async () => {
  try {
    await loginAsGuest();
  } catch (err) {
    alert("Guest login error: " + err.message);
  }
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
  try {
    await logout();
  } catch (err) {
    alert("Logout error: " + err.message);
  }
});

// رویداد دعوت از دوستان
document.getElementById("invite-friends-btn")?.addEventListener("click", () => {
  if (navigator.share) {
    navigator.share({
      title: 'Join me in 2048 Advanced!',
      text: 'Try out this awesome 2048 game!',
      url: window.location.href
    }).catch(console.error);
  } else {
    showCustomAlert("Sharing not supported on this browser.");
  }
});

// رویداد فروشگاه (Shop)
document.getElementById("shop-btn")?.addEventListener("click", () => {
  document.getElementById("shop-modal").style.display = "flex";
  loadShopItems();
});

// رویداد دستاوردها (Achievements)
document.getElementById("achievements-btn")?.addEventListener("click", async () => {
  document.getElementById("achievements-modal").style.display = "flex";
  await loadAchievements();
});

// رویداد دکمه‌های ورود/ثبت‌نام مدال‌های مربوطه در UI از طریق initUI انجام می‌شود.
// رویداد مربوط به دکمه بازگشت از پروفایل به بازی
document.getElementById("back-to-game-btn")?.addEventListener("click", () => {
  document.getElementById("profile-page").hidden = true;
  document.getElementById("game-app").hidden = false;
});

// توابع کمکی فروشگاه و دستاوردها

async function loadShopItems() {
  const shopItemsContainer = document.getElementById("shop-items");
  shopItemsContainer.innerHTML = "";
  // نمونه آیتم‌های فروشگاه
  const items = [
    { id: "skin1", name: "Red Skin", cost: 100 },
    { id: "skin2", name: "Blue Skin", cost: 150 },
    { id: "boost", name: "Score Booster", cost: 200 }
  ];
  items.forEach(item => {
    const itemDiv = document.createElement("div");
    itemDiv.classList.add("shop-item");
    itemDiv.innerHTML = `<span>${item.name} - ${item.cost} coins</span>
      <button data-item="${item.id}">Buy</button>`;
    itemDiv.querySelector("button").addEventListener("click", () => {
      if (window.gameInstance.coins >= item.cost) {
        window.gameInstance.coins -= item.cost;
        window.gameInstance.inAppItems[item.id] = true;
        document.getElementById("shop-modal").style.display = "none";
        showCustomAlert(`You purchased ${item.name}!`);
        updateCoinsUI(window.gameInstance.coins);
      } else {
        showCustomAlert("Not enough coins!");
      }
    });
    shopItemsContainer.appendChild(itemDiv);
  });
}

async function loadAchievements() {
  const achievementsList = document.getElementById("achievements-list");
  achievementsList.innerHTML = "";
  if (window.gameInstance && window.gameInstance.user) {
    const { getAchievements } = await import("./firebaseService.js");
    const achievements = await getAchievements(window.gameInstance.user.uid);
    if (achievements.length === 0) {
      achievementsList.textContent = "No achievements yet.";
    } else {
      achievements.forEach(ach => {
        const div = document.createElement("div");
        div.classList.add("achievement-item");
        div.textContent = `${ach.title}: ${ach.description}`;
        achievementsList.appendChild(div);
      });
    }
  } else {
    achievementsList.textContent = "Login to view achievements.";
  }
}
