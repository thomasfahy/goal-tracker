import "./login.css";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("error");

  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.ok) {
        localStorage.setItem("token", data.token);
        window.location.href = "/";
      } else {
        errorBox.style.display = "block";
        errorBox.textContent = data.message || "Login failed";
      }
    } catch (err) {
      console.error("Login error:", err);
      errorBox.style.display = "block";
      errorBox.textContent = "An unexpected error occurred.";
    }
  };
});
