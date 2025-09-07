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
    if (data.ok && data.goals.length) {
      goalsCache = data.goals;
      data.goals.forEach(g => {
        const card = document.createElement("div");
        card.className = "goal-card";
        card.dataset.goalId = g.goal_id;
        const prog = Math.min((g.xp_info ? g.xp_info.progress : g.xp / 100) * 100, 100);
        const thr = g.xp_info ? g.xp_info.threshold : 100;
        card.innerHTML = `
          <h3>${g.title}</h3>
          <p>${g.description}</p>
          <small>End goal: ${g.end_goal}</small><br/>
          <small>Level: ${g.level} | XP: ${g.xp} / ${thr}</small>
          <div class="progress"><div style="width:${prog}%"></div></div>
        `;
        card.onclick = () => openGoalDetail(g.goal_id);
        goalList.appendChild(card);
      });
    } else {
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

function openGoalDetail(goalId) {
  const g = goalsCache.find(x => x.goal_id === goalId);
  if (!g) return;
  activeGoalId = goalId;
  const thr = g.xp_info ? g.xp_info.threshold : 100;
  const prog = Math.min((g.xp_info ? g.xp_info.progress : g.xp / thr) * 100, 100);
  detailTitle.textContent = g.title;
  detailEndGoal.textContent = g.end_goal;
  detailLevel.textContent = "Level " + g.level;
  detailXp.textContent = `XP ${g.xp} / ${thr}`;
  progressBar.style.width = prog + "%";
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

const deleteGoalBtn = document.getElementById("deleteGoalBtn");

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
