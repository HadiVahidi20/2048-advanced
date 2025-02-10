/**
 * Firebase Service Module
 * Handles Firebase initialization, authentication, Firestore, and Storage operations.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

// پیکربندی Firebase (در صورت نیاز می‌توانید این مقادیر را به متغیرهای محیطی انتقال دهید)
const firebaseConfig = {
  apiKey: "AIzaSyCt6HpOlkai8lIS1UeGGPy1lANuRT_CTKU",
  authDomain: "web-7d2dc.firebaseapp.com",
  projectId: "web-7d2dc",
  storageBucket: "web-7d2dc.firebasestorage.app",
  messagingSenderId: "362134616926",
  appId: "1:362134616926:web:a5613583f7d97e81966dcf",
  measurementId: "G-Q7C25PG1YC"
};

let app, analytics, auth, db, storage;

/**
 * Initialize Firebase app and services.
 * @returns {FirebaseApp} Initialized app instance.
 */
export function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    setPersistence(auth, browserLocalPersistence);
  }
  return app;
}

/**
 * Listen to authentication state changes.
 * @param {Function} callback - Callback function receiving user or null.
 */
export function onAuthStateChangedHandler(callback) {
  onAuthStateChanged(auth, callback);
}

/**
 * Log in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<UserCredential>}
 */
export async function login(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

/**
 * Register a new user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<UserCredential>}
 */
export async function register(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const userDoc = doc(db, "users", user.uid);
    await setDoc(userDoc, {
      username: "User",
      avatar: "",
      level: 1,
      xp: 0,
      xpNext: 1000,
      coins: 0,
      highScore: 0,
      adsRemoved: false,
      dailyMission: { lastClaimedDate: null },
      settings: {
        darkMode: false,
        language: "en",
        sound: true
      }
    });
    return userCredential;
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    return await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

/**
 * Log in using Google authentication.
 * @returns {Promise<UserCredential>}
 */
export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    return await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google login error:", error);
    throw error;
  }
}

/**
 * Log in as an anonymous guest user.
 * @returns {Promise<UserCredential>}
 */
export async function loginAsGuest() {
  try {
    return await signInAnonymously(auth);
  } catch (error) {
    console.error("Guest login error:", error);
    throw error;
  }
}

/**
 * Get user profile data from Firestore.
 * @param {string} uid - User ID.
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(uid) {
  try {
    const userDoc = doc(db, "users", uid);
    const snapshot = await getDoc(userDoc);
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    console.error("Get user profile error:", error);
    return null;
  }
}

/**
 * Update user profile data.
 * @param {string} uid - User ID.
 * @param {Object} data - Data to update.
 * @returns {Promise<void>}
 */
export async function updateUserProfile(uid, data) {
  try {
    const userDoc = doc(db, "users", uid);
    return await updateDoc(userDoc, data);
  } catch (error) {
    console.error("Update user profile error:", error);
    throw error;
  }
}

/**
 * Check if a username is unique.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function isUsernameUnique(username) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty;
  } catch (error) {
    console.error("Username uniqueness error:", error);
    return false;
  }
}

/**
 * Save a score to the leaderboard.
 * @param {string} username
 * @param {number} highScore
 */
export async function saveToLeaderboard(username, highScore) {
  try {
    const lbCol = collection(db, "leaderboard");
    await addDoc(lbCol, {
      username,
      score: highScore,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error("Error saving to leaderboard:", error);
  }
}

/**
 * Get top leaderboard entries.
 * @param {number} limitCount
 * @returns {Promise<Array>}
 */
export async function getTopLeaderboard(limitCount = 5) {
  try {
    const lbCol = collection(db, "leaderboard");
    const q = query(lbCol, orderBy("score", "desc"), limit(limitCount));
    const snapshot = await getDocs(q);
    const results = [];
    snapshot.forEach(doc => results.push(doc.data()));
    return results;
  } catch (error) {
    console.error("Error retrieving leaderboard:", error);
    return [];
  }
}

/**
 * Upload a user's avatar image.
 * @param {string} uid
 * @param {File} file
 * @returns {Promise<string>} URL of the uploaded image.
 */
export async function uploadAvatar(uid, file) {
  try {
    const storageRef = ref(storage, `avatars/${uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateUserProfile(uid, { avatar: url });
    return url;
  } catch (error) {
    console.error("Error uploading avatar:", error);
    throw error;
  }
}

/* Additional functions for achievements and in-app items */

/**
 * Save a user's achievement.
 */
export async function saveAchievement(uid, achievement) {
  try {
    const achievementsRef = collection(db, "achievements");
    await addDoc(achievementsRef, {
      uid,
      ...achievement,
      earnedAt: Date.now()
    });
  } catch (error) {
    console.error("Error saving achievement:", error);
  }
}

/**
 * Get achievements for a user.
 */
export async function getAchievements(uid) {
  try {
    const achievementsRef = collection(db, "achievements");
    const q = query(achievementsRef, where("uid", "==", uid), orderBy("earnedAt", "desc"));
    const snapshot = await getDocs(q);
    const achievements = [];
    snapshot.forEach(doc => achievements.push(doc.data()));
    return achievements;
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return [];
  }
}

/**
 * Update in-app items for a user.
 */
export async function updateUserItems(uid, items) {
  try {
    const userDoc = doc(db, "users", uid);
    await updateDoc(userDoc, { items }, { merge: true });
  } catch (error) {
    console.error("Error updating user items:", error);
    throw error;
  }
}

export { app, analytics, auth, db, storage };
