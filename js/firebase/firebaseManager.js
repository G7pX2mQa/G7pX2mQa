import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, 
  collection, query, orderBy, limit, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, 
  onAuthStateChanged, signOut, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { BigNum } from '../util/bigNum.js';

// --- CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyA9x_8eumoHuC9G5YQITElvlRmjEjpBDo0", 
  authDomain: "ccc-firebase-cf0ef.firebaseapp.com",
  projectId: "ccc-firebase-cf0ef",
  storageBucket: "ccc-firebase-cf0ef.firebasestorage.app",
  messagingSenderId: "398214123922",
  appId: "1:398214123922:web:0583d13fbf6ed44a6d314b",
  measurementId: "G-3X6HK77SB7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// --- HELPERS ---

// Calculate Log10 of a BigNum for sorting
function getBigNumLog10(bn) {
  if (!bn) return -1;
  if (bn.isInfinite && bn.isInfinite()) return Number.POSITIVE_INFINITY;
  if (bn.isZero && bn.isZero()) return 0;
  
  // BigNum structure: value = sig * 10^e
  // log10(val) = log10(sig) + e
  try {
    const sigStr = bn.sig.toString();
    const sigLog = Math.log10(Number(sigStr.slice(0, 15))); // Approximate log of significand
    // Adjust for the fact that sig is integer. 
    // Actually, BigNum.e is the exponent of 10.
    // But BigNum logic: e is such that value = sig * 10^e.
    // However, BigNum normalizes so sig has 'p' digits?
    // Let's rely on toScientific() which is robust.
    // "1.23e50"
    const sci = bn.toScientific(5);
    if (sci === 'Infinity') return Number.POSITIVE_INFINITY;
    if (sci === '0') return 0;
    
    const [mantissa, exponent] = sci.split('e');
    return Math.log10(Number(mantissa)) + Number(exponent);
  } catch (e) {
    console.error("Error calculating log10:", e);
    return 0;
  }
}

// Format BigNum for display (e.g., 1.23e12)
function formatBigNum(bn) {
  if (!bn) return "0";
  try {
    return bn.toScientific(3);
  } catch {
    return "0";
  }
}

// Get max coins across all slots (1, 2, 3)
function getHighestCoins() {
  let maxCoins = BigNum.fromInt(0);
  
  // Check active game state first
  if (window.bank && window.bank.coins) {
    try {
        const currentVal = BigNum.fromAny(window.bank.coins.value.toString());
        if (currentVal.cmp(maxCoins) > 0) {
            maxCoins = currentVal;
        }
    } catch (e) { console.warn("Error reading current coins:", e); }
  }

  // Check localStorage for slots 1, 2, 3
  // Using hardcoded 3 slots as seen in index.html
  for (let i = 1; i <= 3; i++) {
    const key = `ccc:coins:${i}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const slotVal = BigNum.fromAny(raw);
        if (slotVal.cmp(maxCoins) > 0) {
          maxCoins = slotVal;
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  }
  return maxCoins;
}

// --- AUTH ACTIONS ---

window.loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google Login failed:", error);
    alert("Google Login Error: " + error.message);
  }
};

window.registerWithEmail = async () => {
  const email = document.getElementById("email-input").value;
  const pass = document.getElementById("pass-input").value;
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    alert("Account created!");
  } catch (error) {
    console.error("Registration failed:", error);
    alert("Error: " + error.message);
  }
};

window.loginWithEmail = async () => {
  const email = document.getElementById("email-input").value;
  const pass = document.getElementById("pass-input").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (error) {
    console.error("Login failed:", error);
    alert("Error: " + error.message);
  }
};

window.logout = async () => {
  await signOut(auth);
  alert("Logged out!");
  location.reload();
};

// --- DATA ACTIONS ---

// Save high score to Firestore
window.saveUserScore = async () => {
  if (!currentUser) {
    alert("You must be logged in to save your score!");
    return;
  }
  
  try {
    const highestCoins = getHighestCoins();
    const coinsLog = getBigNumLog10(highestCoins);
    const coinsDisplay = formatBigNum(highestCoins);

    await setDoc(doc(db, "leaderboard", currentUser.uid), {
      email: currentUser.email,
      coinsDisplay: coinsDisplay,
      coinsLog: coinsLog,
      lastUpdated: serverTimestamp()
    }, { merge: true });

    console.log("Score Saved!", { coinsDisplay, coinsLog });
    alert(`Score saved! Highest Coins: ${coinsDisplay}`);
    
    // Refresh leaderboard after saving
    window.fetchLeaderboard();
  } catch (e) {
    console.error("Error saving score: ", e);
    alert("Error saving score: " + e.message);
  }
};

// Fetch Leaderboard
window.fetchLeaderboard = async () => {
  const listEl = document.getElementById("leaderboard-list");
  if (!listEl) return;
  
  listEl.innerHTML = "<li>Loading...</li>";

  try {
    const q = query(
      collection(db, "leaderboard"), 
      orderBy("coinsLog", "desc"), 
      limit(10)
    );
    
    const querySnapshot = await getDocs(q);
    listEl.innerHTML = "";
    
    let rank = 1;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const li = document.createElement("li");
      li.textContent = `#${rank++} ${data.email} - ${data.coinsDisplay} Coins`;
      listEl.appendChild(li);
    });

    if (querySnapshot.empty) {
        listEl.innerHTML = "<li>No scores yet. Be the first!</li>";
    }

  } catch (e) {
    console.error("Error fetching leaderboard:", e);
    listEl.innerHTML = "<li>Error loading leaderboard.</li>";
  }
};

// --- UI STATE ---

onAuthStateChanged(auth, (user) => {
  const authForms = document.getElementById("auth-forms");
  const userPanel = document.getElementById("user-panel");
  const userInfo = document.getElementById("user-info");
  
  if (user) {
    currentUser = user;
    if(authForms) authForms.style.display = "none";
    if(userPanel) userPanel.style.display = "block";
    if(userInfo) userInfo.innerText = `Signed in as: ${user.email}`;
    
    // Auto-fetch leaderboard on login
    window.fetchLeaderboard();
  } else {
    currentUser = null;
    if(authForms) authForms.style.display = "block";
    if(userPanel) userPanel.style.display = "none";
  }
});

// Expose auth to window just in case
window.auth = auth;