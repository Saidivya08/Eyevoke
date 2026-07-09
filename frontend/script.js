console.log("script.js loaded");

document.addEventListener("DOMContentLoaded", () => {

    /* ---------------- BASIC ELEMENTS ---------------- */
    const navLinks = document.querySelectorAll("nav a");
    const sections = document.querySelectorAll(".section-content");
    const startBtn = document.querySelector(".cta-btn");
    const homeSection = document.getElementById("home");
    const logoLink = document.querySelector(".brand-name");

    const cam = document.getElementById("cameraFeed");
    const sentenceList = document.getElementById("sentence-list");
    const sentenceInput = document.getElementById("sentence-input");
    const addBtn = document.getElementById("add-btn");
    const deleteBtn = document.getElementById("delete-btn");

    const speedContainer = document.getElementById("scroll-speed-container");
    const speedSlider = document.getElementById("scroll-speed");
    const speedValue = document.getElementById("speed-value");

    let selectedSentence = null;
    let blinkPoller = null;
    let autoScrollTimer = null;

    let autoScrollSpeed = 50;

    // 🔒 FRONTEND BLINK MEMORY
    let lastBlinkIndex = null;
    let lastBlinkAction = null;

    /* ---------------- NAVIGATION ---------------- */
    function showSection(id) {
        sections.forEach(sec => sec.classList.remove("active"));
        homeSection.style.display = "none";

        if (id === "home") {
            homeSection.style.display = "flex";
            return;
        }
        document.getElementById(id)?.classList.add("active");
    }

    navLinks.forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            showSection(link.getAttribute("href").substring(1));
        });
    });

    if (logoLink) {
        logoLink.addEventListener("click", () => showSection("home"));
        logoLink.style.cursor = "pointer";
    }

    /* ---------------- STATUS ---------------- */
    function updateStatus(state) {
        const s = document.getElementById("status-text");
        if (!s) return;

        s.className = "status";
        if (state === "Manual") {
            s.textContent = "Status: Running (Manual)";
            s.classList.add("manual");
        } else if (state === "Auto") {
            s.textContent = "Status: Running (Auto)";
            s.classList.add("auto");
        } else {
            s.textContent = "Status: Idle";
            s.classList.add("idle");
        }
    }

    /* ---------------- MODE ---------------- */
    let selectedMode =
        document.querySelector("input[name='blink-mech']:checked")?.value || "manual";

    document.getElementsByName("blink-mech").forEach(radio => {
        radio.addEventListener("change", e => {
            selectedMode = e.target.value;

            if (selectedMode === "auto") {
                speedContainer.style.display = "block";
            } else {
                speedContainer.style.display = "none";
                stopAutoScroll();
            }
        });
    });

    speedSlider.addEventListener("input", () => {
        autoScrollSpeed = speedSlider.value;
        speedValue.textContent = autoScrollSpeed;

        if (selectedMode === "auto") startAutoScroll();
    });

    /* ---------------- BLINK POLLING ---------------- */
    function startBlinkPolling() {
        if (blinkPoller) return;

        blinkPoller = setInterval(() => {
            fetch("http://127.0.0.1:5000/blink_status")
                .then(r => r.json())
                .then(d => {
                    if (!d.action) return;

                    if (d.index === lastBlinkIndex && d.action === lastBlinkAction) return;

                    lastBlinkIndex = d.index;
                    lastBlinkAction = d.action;

                    highlightByIndex(d.index, d.action);
                })
                .catch(() => {});
        }, 200);
    }

    function stopBlinkPolling() {
        if (blinkPoller) {
            clearInterval(blinkPoller);
            blinkPoller = null;
        }
        lastBlinkIndex = null;
        lastBlinkAction = null;
    }

    /* ---------------- AUTO SCROLL ---------------- */
    function startAutoScroll() {
        if (autoScrollTimer) clearInterval(autoScrollTimer);

        autoScrollTimer = setInterval(() => {
            if (selectedMode !== "auto") return;
            sentenceList.scrollTop += 1;
        }, 120 - autoScrollSpeed);
    }

    function stopAutoScroll() {
        if (autoScrollTimer) {
            clearInterval(autoScrollTimer);
            autoScrollTimer = null;
        }
    }

    /* ---------------- START ---------------- */
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            showSection("communication");

            fetch(`http://127.0.0.1:5000/start?mode=${selectedMode}`)
                .then(() => {
                    updateStatus(selectedMode === "auto" ? "Auto" : "Manual");

                    if (cam) {
                        cam.src = "http://127.0.0.1:5000/video_feed";
                        cam.style.display = "block";
                    }

                    startBlinkPolling();
                    if (selectedMode === "auto") startAutoScroll();
                });
        });
    }

    /* ---------------- STOP ---------------- */
    document.getElementById("stop-btn")?.addEventListener("click", () => {
        fetch("http://127.0.0.1:5000/stop").then(() => {
            updateStatus("Idle");
            if (cam) cam.src = "";
            stopBlinkPolling();
            stopAutoScroll();
        });
    });

    /* ---------------- SENTENCES ---------------- */
    function loadSentences() {
        sentenceList.innerHTML = "";

        fetch("http://127.0.0.1:5000/get_sentences")
            .then(res => res.json())
            .then(data => {
                (data.sentences || []).forEach(text => createSentence(text));
            });
    }

    function createSentence(text) {
        const div = document.createElement("div");
        div.className = "sentence-item";
        div.textContent = text;

        div.addEventListener("click", () => {
            document.querySelectorAll(".sentence-item")
                .forEach(i => i.classList.remove("selected", "spoken"));
            div.classList.add("selected");
            selectedSentence = div;
            sentenceInput.value = text;
        });

        sentenceList.appendChild(div);
    }

    function syncSentencesToBackend() {
        const sentences = [...document.querySelectorAll(".sentence-item")]
            .map(x => x.textContent);

        fetch("http://127.0.0.1:5000/update_sentences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sentences })
        });
    }

    function addSentence() {
        const text = sentenceInput.value.trim();
        if (!text) return;

        if (selectedSentence) {
            selectedSentence.textContent = text;
            selectedSentence.classList.remove("selected");
            selectedSentence = null;
        } else {
            createSentence(text);
        }

        sentenceInput.value = "";

        lastBlinkIndex = null;
        lastBlinkAction = null;

        syncSentencesToBackend();
    }

    addBtn?.addEventListener("click", addSentence);
    sentenceInput?.addEventListener("keypress", e => {
        if (e.key === "Enter") addSentence();
    });

    deleteBtn?.addEventListener("click", () => {
        if (!selectedSentence) return;

        selectedSentence.remove();
        selectedSentence = null;

        lastBlinkIndex = null;
        lastBlinkAction = null;

        syncSentencesToBackend();
    });

    /* ---------------- HIGHLIGHT ---------------- */
    function highlightByIndex(i, action = "move") {
        const items = document.querySelectorAll(".sentence-item");
        if (!items[i]) return;

        items.forEach(x => x.classList.remove("selected", "spoken"));

        if (action === "select") {
            items[i].classList.add("spoken");
        } else {
            items[i].classList.add("selected");
        }

        items[i].scrollIntoView({ block: "center", behavior: "smooth" });
    }

    /* ---------------- INIT ---------------- */
    loadSentences();
     /* ---------------- THEME TOGGLE (FINAL FIX) ---------------- */

     /* ---------------- THEME TOGGLE (RADIO BASED - FINAL) ---------------- */

const themeRadios = document.querySelectorAll("input[name='theme']");

// Restore saved theme
const savedTheme = localStorage.getItem("theme") || "dark";

if (savedTheme === "light") {
    document.body.classList.add("light-mode");
    document.querySelector("input[name='theme'][value='light']").checked = true;
} else {
    document.body.classList.remove("light-mode");
    document.querySelector("input[name='theme'][value='dark']").checked = true;
}

// Listen to radio change
themeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
        if (radio.value === "light") {
            document.body.classList.add("light-mode");
            localStorage.setItem("theme", "light");
        } else {
            document.body.classList.remove("light-mode");
            localStorage.setItem("theme", "dark");
        }
    });
});




});