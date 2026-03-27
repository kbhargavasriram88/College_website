document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("student");
  if (!currentSession) {
    return;
  }

  setupTabs();
  setupSidebar();

  let currentStudent = null;
  try {
    currentStudent = await AttendanceApi.getCurrentStudent();
  } catch (error) {
    console.error(error);
  }

  populateSharedHeader(currentSession, currentStudent);
  populateProfilePage(currentSession, currentStudent);
});

/**
 * Handles Tab Switching for Profile Page
 */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  if (!tabs.length || !contents.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Remove active from all tabs and contents
      tabs.forEach(item => item.classList.remove("active"));
      contents.forEach(content => content.classList.remove("active"));

      // Add active to current
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) {
        target.classList.add("active");
      }
    });
  });
}

/**
 * Handles Sidebar Toggle (Desktop and Mobile)
 */
function setupSidebar() {
  const menuIcon = document.querySelector(".menu-icon");
  const sidebar = document.querySelector(".sidebar");

  if (!menuIcon || !sidebar) {
    return;
  }

  menuIcon.addEventListener("click", () => {
    if (window.innerWidth <= 900) {
      sidebar.classList.toggle("show");
    } else {
      sidebar.classList.toggle("collapsed");
    }
  });

  // Close sidebar on mobile when clicking outside
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 900 && 
        !sidebar.contains(e.target) && 
        !menuIcon.contains(e.target) && 
        sidebar.classList.contains("show")) {
      sidebar.classList.remove("show");
    }
  });
}

function populateSharedHeader(currentSession, student) {
  const welcomeName = document.getElementById("welcomeName");
  if (!welcomeName) {
    return;
  }

  welcomeName.textContent = student?.name || currentSession.studentName || currentSession.name || "Student";
}

function populateProfilePage(currentSession, student) {
  if (!document.getElementById("profileName")) {
    return;
  }

  if (!student) {
    setText("profileName", currentSession.studentName || currentSession.name || "Student");
    setText("profileLoginId", currentSession.studentRoll || currentSession.username || "Not Assigned");
    return;
  }

  const defaultPhoto = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
  const photo = document.getElementById("profilePhoto");
  if (photo) {
    photo.src = student.photo || defaultPhoto;
  }

  setText("profileName", student.name || currentSession.name || "Student");
  setText("profileRoll", student.roll || currentSession.studentRoll || "Not Assigned");
  setText("profileClass", student.class || "Not Provided");
  setText("profileCourse", student.course || "Not Provided");
  setText("profileYear", student.year || "Not Provided");
  setText("profileSemester", student.semester || "Not Provided");
  setText("profileEmail", student.email || "Not Provided");
  setText("profilePhone", student.phone || "Not Provided");
  setText("profileAddress", student.address || "Not Provided");
  setText("profileLoginId", student.roll || currentSession.username || "Not Assigned");
  setText("profileAccess", "Active");
  setText("academicCourse", student.course || "Not Provided");
  setText("academicYear", student.year || "Not Provided");
  setText("academicSemester", student.semester || "Not Provided");
  setText("academicClass", student.class || "Not Provided");
  setText("contactEmail", student.email || "Not Provided");
  setText("contactPhone", student.phone || "Not Provided");
  setText("contactAddress", student.address || "Not Provided");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}
