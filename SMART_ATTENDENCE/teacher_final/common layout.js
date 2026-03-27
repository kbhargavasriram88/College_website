document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  // Update Current Date
  const dateElement = document.getElementById("currentDate");
  if (dateElement) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = new Date().toLocaleDateString(undefined, options);
  }

  // Update User Display
  const userElement = document.querySelector(".user");
  if (userElement) {
    userElement.innerHTML = `<span class="icon">👤</span> ${currentSession.name || currentSession.username}`;
  }

  // Sidebar Toggle Logic
  const toggleBtn = document.querySelector(".menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      if (window.innerWidth <= 900) {
        sidebar.classList.toggle("show");
      } else {
        sidebar.classList.toggle("collapsed");
      }
    });

    // Close on mobile when clicking outside
    document.addEventListener("click", (e) => {
      if (window.innerWidth <= 900 && 
          sidebar.classList.contains("show") && 
          !sidebar.contains(e.target) && 
          !toggleBtn.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    });
  }

  // Handle Active Link Highlighting
  const currentPath = decodeURIComponent(window.location.pathname.split("/").pop());
  const navLinks = document.querySelectorAll(".sidebar li");
  navLinks.forEach(li => {
    const link = li.querySelector("a");
    if (link) {
      const href = link.getAttribute("href");
      if (href === currentPath) {
        li.classList.add("active");
      } else {
        li.classList.remove("active");
      }
    }
  });

  // Logout Logic
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async event => {
      event.preventDefault();
      const confirmLogout = confirm("Are you sure you want to logout?");
      if (!confirmLogout) return;

      try {
        await AttendanceApi.logout();
        window.location.href = "/login.html";
      } catch (err) {
        console.error("Logout failed:", err);
        window.location.href = "/login.html";
      }
    });
  }
});
