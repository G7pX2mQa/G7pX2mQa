import { NODE_MAP } from "../game/labNodes.js";
import { playAudio } from "../util/audioManager.js";
import { isViewingLabTab } from "./merchantTabs/dlgTab.js";
import { IS_MOBILE, IS_FIREFOX } from "../util/platformChecker.js";
import { getActiveSlot } from "../util/storage.js";

let container = null;
const queue = [];
let isProcessing = false;
let isPaused = true;

const activeNotifications = new Set();
const activeWelcomePopups = new Set();
const MIN_PLAYABLE_LANDSCAPE_HEIGHT = 500;
let landscapeWarningTracker = null;
let landscapeWarningShownForSession = false;

export function nukeNotifications(clearAll = true) {
    if (clearAll) {
        queue.length = 0;
    }

    for (const notif of activeNotifications) {
        if (notif.audio && typeof notif.audio.stop === "function") {
            notif.audio.stop();
        }
        if (notif.element) {
            notif.element.remove();
        }
        if (typeof notif.resolve === "function") {
            notif.resolve();
        }
        if (notif.timeoutId) clearTimeout(notif.timeoutId);
        if (notif.fallbackTimeoutId) clearTimeout(notif.fallbackTimeoutId);
    }
    activeNotifications.clear();

    for (const popup of activeWelcomePopups) {
        if (popup.audio && typeof popup.audio.stop === "function") {
            popup.audio.stop();
        }
        if (popup.element) {
            popup.element.remove();
        }
        if (popup.timeoutId) clearTimeout(popup.timeoutId);
        if (popup.fallbackTimeoutId) clearTimeout(popup.fallbackTimeoutId);
    }
    activeWelcomePopups.clear();

    if (landscapeWarningTracker) {
        if (landscapeWarningTracker.audio && typeof landscapeWarningTracker.audio.stop === "function") {
            landscapeWarningTracker.audio.stop();
        }
        if (landscapeWarningTracker.element) {
            landscapeWarningTracker.element.remove();
        }
        if (landscapeWarningTracker.timeoutId) clearTimeout(landscapeWarningTracker.timeoutId);
        if (landscapeWarningTracker.fallbackTimeoutId) clearTimeout(landscapeWarningTracker.fallbackTimeoutId);
        landscapeWarningTracker = null;
    }

    if (clearAll && container) {
        container.innerHTML = "";
    }
}

function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "notification-container";
    document.body.appendChild(container);
    return container;
}

export function pauseNotifications() {
    isPaused = true;
    const now = Date.now();

    for (const notif of activeNotifications) {
        if (notif.timeoutId) {
            clearTimeout(notif.timeoutId);
            notif.timeoutId = null;
            notif.remainingDuration = Math.max(0, notif.duration - (now - notif.startTime));
        }
    }

    for (const popup of activeWelcomePopups) {
        if (popup.timeoutId) {
            clearTimeout(popup.timeoutId);
            popup.timeoutId = null;
            popup.remainingDuration = Math.max(0, popup.duration - (now - popup.startTime));
        }
    }

    if (landscapeWarningTracker && landscapeWarningTracker.timeoutId) {
        clearTimeout(landscapeWarningTracker.timeoutId);
        landscapeWarningTracker.timeoutId = null;
        landscapeWarningTracker.remainingDuration = Math.max(
            0,
            landscapeWarningTracker.duration - (now - landscapeWarningTracker.startTime),
        );
    }
}

export function unpauseNotifications() {
    isPaused = false;
    const now = Date.now();

    for (const notif of activeNotifications) {
        if (!notif.timeoutId && notif.remainingDuration != null) {
            notif.startTime = now;
            notif.duration = notif.remainingDuration;
            notif.timeoutId = setTimeout(notif.triggerLeaving, notif.remainingDuration);
        }
    }

    for (const popup of activeWelcomePopups) {
        if (!popup.timeoutId && popup.remainingDuration != null) {
            popup.startTime = now;
            popup.duration = popup.remainingDuration;
            popup.timeoutId = setTimeout(popup.triggerLeaving, popup.remainingDuration);
        }
    }

    if (
        landscapeWarningTracker &&
        !landscapeWarningTracker.timeoutId &&
        landscapeWarningTracker.remainingDuration != null
    ) {
        landscapeWarningTracker.startTime = now;
        landscapeWarningTracker.duration = landscapeWarningTracker.remainingDuration;
        landscapeWarningTracker.timeoutId = setTimeout(
            landscapeWarningTracker.triggerLeaving,
            landscapeWarningTracker.remainingDuration,
        );
    }
    processQueue();
}

async function processQueue() {
    if (isProcessing || isPaused || queue.length === 0) return;
    isProcessing = true;

    const { text, iconSrc, duration } = queue.shift();

    await displayNotification(text, iconSrc, duration);

    isProcessing = false;
    // Process next item if any
    if (queue.length > 0) {
        processQueue();
    }
}

function displayNotification(text, iconSrc, duration) {
    return new Promise((resolve) => {
        const parent = ensureContainer();

        const el = document.createElement("div");
        el.className = "notification";

        if (iconSrc) {
            const icon = document.createElement("img");
            icon.src = iconSrc;
            icon.className = "notification-icon";
            icon.alt = "";
            el.appendChild(icon);
        }

        const content = document.createElement("div");
        content.className = "notification-text";
        content.innerHTML = text;
        el.appendChild(content);

        parent.appendChild(el);

        const audio = playAudio("sounds/notif_ding.ogg", { volume: 0.5 });

        const notifTracker = {
            element: el,
            audio,
            resolve: null,
            timeoutId: null,
            fallbackTimeoutId: null,
            startTime: Date.now(),
            duration,
            triggerLeaving: null,
        };
        activeNotifications.add(notifTracker);

        const wrappedResolve = () => {
            activeNotifications.delete(notifTracker);
            resolve();
        };
        notifTracker.resolve = wrappedResolve;

        // Animate in
        // Use double RAF to ensure transition triggers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add("is-visible");
            });
        });

        notifTracker.triggerLeaving = () => {
            el.classList.remove("is-visible");
            el.classList.add("is-leaving");

            const cleanup = () => {
                el.remove();
                wrappedResolve();
            };

            el.addEventListener("transitionend", cleanup, { once: true });

            // Safety timeout in case transitionend doesn't fire
            notifTracker.fallbackTimeoutId = setTimeout(() => {
                if (el.isConnected) {
                    el.remove();
                    wrappedResolve();
                }
            }, 600);
        };

        // Wait for duration
        notifTracker.timeoutId = setTimeout(notifTracker.triggerLeaving, duration);
    });
}

export function showNotification(text, iconSrc, duration = 5000) {
    queue.push({ text, iconSrc, duration });
    processQueue();
}

export function initNotifications() {
    if (typeof window === "undefined") return;

    if (IS_MOBILE) {
        const checkOrientation = () => {
            if (getActiveSlot() == null) {
                hideLandscapeWarningPopup();
                landscapeWarningShownForSession = false;
                return;
            }
            if (window.innerWidth > window.innerHeight && window.innerHeight < MIN_PLAYABLE_LANDSCAPE_HEIGHT) {
                if (!landscapeWarningShownForSession) {
                    showLandscapeWarningPopup();
                    landscapeWarningShownForSession = true;
                }
            } else {
                hideLandscapeWarningPopup();
                landscapeWarningShownForSession = false;
            }
        };
        window.addEventListener("resize", checkOrientation);
        window.addEventListener("orientationchange", checkOrientation);
        // Initial check deferred slightly to ensure layout is ready
        setTimeout(checkOrientation, 500);
    }

    window.addEventListener("lab:node:change", (e) => {
        const { id, level, suppressNotify } = e.detail || {};
        if (!id || level == null || suppressNotify) return;

        const node = NODE_MAP.get(id);
        if (!node) return;

        // Check max level
        const maxLevel = node.maxLevel;
        if (level < maxLevel) return;

        // Check if viewing lab
        if (isViewingLabTab()) return;

        // Show notification
        const title = node.title || "Node";
        showNotification(`${title}<br>Maxed!`, node.icon);
    });
}

export function showWelcomePopup(isMobile, onComplete) {
    const parent = document.createElement("div");
    parent.className = "welcome-popup-container";

    const el = document.createElement("div");
    el.className = "welcome-popup notification-text";

    const action = isMobile ? "swiping your finger" : "hovering your cursor";
    el.innerHTML = `Welcome to the game! Collect the Coins by ${action} over them.`;

    parent.appendChild(el);
    document.body.appendChild(parent);

    const audio = playAudio("sounds/notif_ding.ogg", { volume: 0.5 });

    const popupTracker = {
        element: parent,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null,
        startTime: Date.now(),
        duration: 9000,
        triggerLeaving: null,
    };
    activeWelcomePopups.add(popupTracker);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add("is-visible");
        });
    });

    let completed = false;
    const completeAndCleanup = () => {
        if (completed) return;
        completed = true;
        parent.remove();
        activeWelcomePopups.delete(popupTracker);
        if (typeof onComplete === "function") {
            try {
                onComplete();
            } catch (err) {
                console.error("Error in showWelcomePopup onComplete:", err);
            }
        }
    };

    popupTracker.triggerLeaving = () => {
        el.classList.remove("is-visible");
        el.classList.add("is-leaving");

        el.addEventListener("transitionend", completeAndCleanup, { once: true });

        popupTracker.fallbackTimeoutId = setTimeout(() => {
            if (parent.isConnected) {
                completeAndCleanup();
            } else {
                activeWelcomePopups.delete(popupTracker);
            }
        }, 1200);
    };

    popupTracker.timeoutId = setTimeout(popupTracker.triggerLeaving, 9000); // 1s enter + 8s wait = 9000ms
}

export function showFirefoxNoticeModal() {
    const existing = document.querySelector(".firefox-notice-overlay");
    if (existing) {
        existing.remove();
    }

    const overlayEl = document.createElement("div");
    overlayEl.className = "firefox-notice-overlay is-visible";
    overlayEl.setAttribute("role", "dialog");
    overlayEl.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "firefox-notice-card";

    const content = document.createElement("div");
    content.className = "firefox-notice-content";

    const textEl = document.createElement("div");
    textEl.className = "firefox-notice-text";

    textEl.innerHTML = `
        <p style="font-weight: 800; font-size: 1.15em; color: #ffeb3b; margin-bottom: 12px;">Read this message fully:</p>
        <p>It has been detected that you are using the Firefox browser. While this game is supported on this browser, some visually intense sections of the game may drag down the game's performance. Firefox's visual rendering engine is generally worse than Chromium at rendering complex canvas visuals which this game utilizes in many places.</p>
        <p>In order to make sure the game is still as accessible as possible, there are a variety of performance settings in Stats & Settings. In particular, there is a setting you can enable called "Spreadsheet Mode" which strips away all of the complex visuals, fancy animations, and stuff like that in order to greatly improve performance.</p>
        <p>But anyway, enough reading, go collect some Coins!</p>
    `.trim();

    content.appendChild(textEl);
    card.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "firefox-notice-actions sas-actions";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sas-close";
    closeBtn.textContent = "Close";

    const closeModal = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlayEl.remove();
    };

    closeBtn.addEventListener("click", closeModal);
    actions.appendChild(closeBtn);
    card.appendChild(actions);

    overlayEl.appendChild(card);

    overlayEl.addEventListener("click", (e) => {
        if (e.target === overlayEl) {
            closeModal();
        }
    });

    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            closeModal();
        }
    };
    document.addEventListener("keydown", onKeyDown);

    document.body.appendChild(overlayEl);
}

export function showFirefoxNotification(isMobile = IS_MOBILE) {
    const parent = document.createElement("div");
    parent.className = "welcome-popup-container";

    const el = document.createElement("div");
    el.className = "welcome-popup notification-text firefox-message-popup";

    const actionWord = isMobile ? "Tap" : "Click";
    const textEl = document.createElement("div");
    textEl.className = "firefox-notif-text";
    textEl.textContent = `You have received a special message! ${actionWord} the button below to view it.`;
    el.appendChild(textEl);

    const btnRow = document.createElement("div");
    btnRow.className = "firefox-notif-btn-row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "firefox-notif-btn";
    btn.textContent = "View Message";

    btnRow.appendChild(btn);
    el.appendChild(btnRow);

    parent.appendChild(el);
    document.body.appendChild(parent);

    const audio = playAudio("sounds/notif_ding.ogg", { volume: 0.5 });

    const popupTracker = {
        element: parent,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null,
        startTime: Date.now(),
        duration: 9000,
        triggerLeaving: null,
    };
    activeWelcomePopups.add(popupTracker);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add("is-visible");
        });
    });

    popupTracker.triggerLeaving = () => {
        el.classList.remove("is-visible");
        el.classList.add("is-leaving");

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            parent.remove();
            activeWelcomePopups.delete(popupTracker);
        };

        el.addEventListener("transitionend", cleanup, { once: true });

        popupTracker.fallbackTimeoutId = setTimeout(() => {
            if (parent.isConnected) {
                parent.remove();
            }
            activeWelcomePopups.delete(popupTracker);
        }, 1200);
    };

    popupTracker.timeoutId = setTimeout(popupTracker.triggerLeaving, 9000);

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (popupTracker.timeoutId) {
            clearTimeout(popupTracker.timeoutId);
            popupTracker.timeoutId = null;
        }
        popupTracker.triggerLeaving();
        showFirefoxNoticeModal();
    });
}

export function showWideNotification(text, duration = 9000, options = {}) {
    const parent = document.createElement("div");
    parent.className = "welcome-popup-container";

    const el = document.createElement("div");
    el.className = "welcome-popup notification-text";

    el.innerHTML = text;

    parent.appendChild(el);
    document.body.appendChild(parent);

    let audio = null;
    if (!options.muteSound) {
        audio = playAudio("sounds/notif_ding.ogg", { volume: 0.5 });
    }

    const popupTracker = {
        element: parent,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null,
        startTime: Date.now(),
        duration,
        triggerLeaving: null,
    };
    activeWelcomePopups.add(popupTracker);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add("is-visible");
        });
    });

    popupTracker.triggerLeaving = () => {
        el.classList.remove("is-visible");
        el.classList.add("is-leaving");

        const cleanup = () => {
            parent.remove();
            activeWelcomePopups.delete(popupTracker);
        };

        el.addEventListener("transitionend", cleanup, { once: true });

        popupTracker.fallbackTimeoutId = setTimeout(() => {
            if (parent.isConnected) {
                parent.remove();
            }
            activeWelcomePopups.delete(popupTracker);
        }, 1200);
    };

    popupTracker.timeoutId = setTimeout(popupTracker.triggerLeaving, duration);
}

export function showWeeklyReminderPopup() {
    showWideNotification(
        `Weekly reminder: Remember to export your save data (Main menu → Manage save slots) in case you lose it!`,
        18000,
    );
}

export function showLandscapeWarningPopup() {
    if (landscapeWarningTracker) return;

    const parent = document.createElement("div");
    parent.className = "welcome-popup-container";

    const el = document.createElement("div");
    el.className = "welcome-popup notification-text";

    el.innerHTML = `This game is intended to be played in Portrait mode. Landscape mode may be unplayable.`;

    parent.appendChild(el);
    document.body.appendChild(parent);

    const audio = playAudio("sounds/notif_ding.ogg", { volume: 0.5 });

    landscapeWarningTracker = {
        element: parent,
        el,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null,
        startTime: Date.now(),
        duration: 18000,
        triggerLeaving: null,
    };

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add("is-visible");
        });
    });

    landscapeWarningTracker.triggerLeaving = () => {
        hideLandscapeWarningPopup();
    };

    landscapeWarningTracker.timeoutId = setTimeout(landscapeWarningTracker.triggerLeaving, 18000); // 18000ms
}

export function hideLandscapeWarningPopup() {
    if (!landscapeWarningTracker) return;

    const tracker = landscapeWarningTracker;
    landscapeWarningTracker = null;

    const { element: parent, el, timeoutId, fallbackTimeoutId } = tracker;

    if (timeoutId) clearTimeout(timeoutId);
    if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);

    el.classList.remove("is-visible");
    el.classList.add("is-leaving");

    const cleanup = () => {
        if (parent.isConnected) {
            parent.remove();
        }
    };

    el.addEventListener("transitionend", cleanup, { once: true });

    tracker.fallbackTimeoutId = setTimeout(() => {
        if (parent.isConnected) {
            parent.remove();
        }
    }, 1200);
}

export function triggerInitialLandscapeCheck() {
    if (!IS_MOBILE) return;
    if (getActiveSlot() == null) return;
    landscapeWarningShownForSession = false;
    if (window.innerWidth > window.innerHeight && window.innerHeight < MIN_PLAYABLE_LANDSCAPE_HEIGHT) {
        showLandscapeWarningPopup();
        landscapeWarningShownForSession = true;
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("saveSlot:change", () => {
        nukeNotifications(true);
    });
}
