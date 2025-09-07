import "./styles.css";

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) window.location.href = "/login.html";
});

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };
}

function xpToNext(level){ return 100 + Math.floor(level * 10); }

function normalizeLevelXp(level, xp){
  let l = level;
  let x = xp;
  let t = xpToNext(l);
  while (x >= t){
    x -= t;
    l += 1;
    t = xpToNext(l);
  }
  return { level: l, xp: x, threshold: t, progress: Math.min(x / t, 1) };
}

// convert a (level,xp) pair into absolute XP from level 1 start
function levelPairToAbsoluteXp(level, xp){
  let abs = 0;
  for (let i = 1; i < level; i++) abs += xpToNext(i);
  abs += xp;
  return abs;
}

// convert absolute XP into a global (level,xp,threshold,progress)
function absoluteXpToLevel(absXp){
  let l = 1;
  let remaining = absXp;
  let t = xpToNext(l);
  while (remaining >= t){
    remaining -= t;
    l += 1;
    t = xpToNext(l);
  }
  return { level: l, xp: remaining, threshold: t, progress: Math.min(remaining / t, 1) };
}

export async function pingApi() {
  try {
    const res = await fetch("/api/ping", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log("API response:", data);
  } catch (err) {
    console.error("Ping failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  pingApi();
});

export async function fetchUsers() {
  try {
    const res = await fetch("/api/users", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log("Users API response:", data);
  } catch (err) {
    console.error("Failed to fetch users:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchUsers();
});

const goalList = document.getElementById("goalList");
const addBtn = document.getElementById("addGoalBtn");
const modal = document.getElementById("goalModal");
const cancelBtn = document.getElementById("cancelBtn");
const form = document.getElementById("goalForm");

// overall bar mount point (insert before the goals grid)
let overallWrap = document.getElementById("overallWrap");
if (!overallWrap) {
  overallWrap = document.createElement("div");
  overallWrap.id = "overallWrap";
  overallWrap.className = "overall-wrap";
  goalList.parentNode.insertBefore(overallWrap, goalList);
  overallWrap.innerHTML = `
    <div class="overall-title">Life Level</div>
    <div class="overall-bar"><div class="overall-fill" id="overallFill"></div></div>
    <div class="overall-meta"><span id="overallLevel"></span><span id="overallXp"></span></div>
  `;
}

if (addBtn && cancelBtn) {
  addBtn.onclick = () => modal.classList.remove("hidden");
  cancelBtn.onclick = () => modal.classList.add("hidden");
}

let goalsCache = [];
let activeGoalId = null;

async function loadGoals() {
  try {
    const res = await fetch("/api/goals", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    const data = await res.json();
    goalList.innerHTML = "";

    // overall progress elements
    const fill = document.getElementById("overallFill");
    const lvl = document.getElementById("overallLevel");
    const xpMeta = document.getElementById("overallXp");

    if (data.ok && data.goals.length) {
      goalsCache = data.goals;

      // compute global absolute xp
      let totalAbs = 0;
      goalsCache.forEach(g => {
        const n = normalizeLevelXp(g.level, g.xp);
        totalAbs += levelPairToAbsoluteXp(n.level, n.xp);
      });

      // convert back to global level/progress
      const G = absoluteXpToLevel(totalAbs);
      if (fill) fill.style.width = (G.progress * 100) + "%";
      if (lvl) lvl.textContent = `Level ${G.level}`;
      if (xpMeta) xpMeta.textContent = `XP ${G.xp} / ${G.threshold}`;

      // render cards
      data.goals.forEach(g => {
        const n = normalizeLevelXp(g.level, g.xp);
        const card = document.createElement("div");
        card.className = "goal-card";
        card.dataset.goalId = g.goal_id;
        card.innerHTML = `
          <h3>${g.title}</h3>
          <p>${g.description}</p>
          <span class="end-goal">End goal: ${g.end_goal}</span>
          <div class="next-step">
            Next step: ${g.current_step ? g.current_step.description : "No step set yet"}
          </div>
          <small>Level: ${n.level} | XP: ${n.xp} / ${n.threshold}</small>
          <div class="progress">
            <div class="progress-bar" style="width:${n.progress*100}%; background:#7c5cff"></div>
          </div>
        `;
        card.onclick = () => openGoalDetail(g.goal_id);
        goalList.appendChild(card);
      });
    } else {
      if (fill) fill.style.width = "0%";
      if (lvl) lvl.textContent = "Level 1";
      if (xpMeta) xpMeta.textContent = "XP 0 / 100";
      goalList.innerHTML = "<p>No goals yet. Add one!</p>";
    }
  } catch (err) {
    console.error("Error loading goals", err);
  }
}

if (form) {
  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    const res = await fetch("/api/goals", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    const result = await res.json();
    if (result.ok) {
      form.reset();
      modal.classList.add("hidden");
      loadGoals();
    } else {
      alert("Failed to add goal: " + (result.message || "Unknown error"));
    }
  };
}

const detailModal = document.getElementById("goalDetailModal");
const detailClose = document.getElementById("detailClose");
const detailTitle = document.getElementById("detailTitle");
const detailEndGoal = document.getElementById("detailEndGoal");
const detailLevel = document.getElementById("detailLevel");
const detailXp = document.getElementById("detailXp");
const progressBar = document.getElementById("progressBar");
const detailStepInput = document.getElementById("detailStepInput");
const saveStepBtn = document.getElementById("saveStepBtn");
const completeStepBtn = document.getElementById("completeStepBtn");
const deleteGoalBtn = document.getElementById("deleteGoalBtn");

function openGoalDetail(goalId) {
  const g = goalsCache.find(x => x.goal_id === goalId);
  if (!g) return;
  activeGoalId = goalId;
  const n = normalizeLevelXp(g.level, g.xp);
  detailTitle.textContent = g.title;
  detailEndGoal.textContent = g.end_goal;
  detailLevel.textContent = "Level " + n.level;
  detailXp.textContent = `XP ${n.xp} / ${n.threshold}`;
  progressBar.style.width = (n.progress*100) + "%";
  progressBar.style.background = "#7c5cff";
  detailStepInput.value = g.current_step ? g.current_step.description : "";
  detailModal.classList.remove("hidden");
}

if (detailClose) {
  detailClose.onclick = () => {
    detailModal.classList.add("hidden");
    activeGoalId = null;
  };
}

if (saveStepBtn) {
  saveStepBtn.onclick = async () => {
    if (!activeGoalId) return;
    const v = detailStepInput.value.trim();
    if (!v) return;
    const res = await fetch(`/api/goals/${activeGoalId}/step`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ description: v })
    });
    const j = await res.json();
    if (j.ok) {
      await loadGoals();
      openGoalDetail(activeGoalId);
    } else {
      alert(j.message || "Failed to save step");
    }
  };
}

if (completeStepBtn) {
  completeStepBtn.onclick = async () => {
    if (!activeGoalId) return;
    const next = prompt("Next step");
    if (!next) return;
    const res = await fetch(`/api/goals/${activeGoalId}/complete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ next_step: next, xp_value: 100 })
    });
    const j = await res.json();
    if (j.ok) {
      await loadGoals();
      openGoalDetail(activeGoalId);
    } else {
      alert(j.message || "Failed to complete step");
    }
  };
}

if (deleteGoalBtn) {
  deleteGoalBtn.onclick = async () => {
    if (!activeGoalId) return;
    if (!confirm("Delete this goal? This cannot be undone.")) return;
    const res = await fetch(`/api/goals/${activeGoalId}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const j = await res.json();
    if (j.ok) {
      document.getElementById("goalDetailModal").classList.add("hidden");
      activeGoalId = null;
      await loadGoals();
    } else {
      alert(j.message || "Failed to delete goal");
    }
  };
}

loadGoals();
