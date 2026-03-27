document.addEventListener("DOMContentLoaded", () => {
  const assignmentsBody = document.getElementById("assignmentsBody");
  const addAssignmentBtn = document.getElementById("addAssignmentBtn");
  const assignmentModal = document.getElementById("assignmentModal");
  const closeBtn = document.querySelector(".close");
  const assignmentForm = document.getElementById("assignmentForm");

  const submissionsModal = document.getElementById("submissionsModal");
  const closeSubsBtn = document.querySelector(".close-subs");
  const submissionsBody = document.getElementById("submissionsBody");

  const gradeModal = document.getElementById("gradeModal");
  const closeGradeBtn = document.querySelector(".close-grade");
  const gradeForm = document.getElementById("gradeForm");

  const classFilter = document.getElementById("classFilter");
  const subjectFilter = document.getElementById("subjectFilter");

  let allAssignments = [];

  // Modal Controls (Moved to top for early interaction)
  if (addAssignmentBtn) {
    addAssignmentBtn.onclick = () => { assignmentModal.style.display = "block"; };
  }
  if (closeBtn) closeBtn.onclick = () => { assignmentModal.style.display = "none"; };
  if (closeSubsBtn) closeSubsBtn.onclick = () => { submissionsModal.style.display = "none"; };
  if (closeGradeBtn) closeGradeBtn.onclick = () => { gradeModal.style.display = "none"; };

  window.onclick = (event) => {
    if (event.target == assignmentModal) assignmentModal.style.display = "none";
    if (event.target == submissionsModal) submissionsModal.style.display = "none";
    if (event.target == gradeModal) gradeModal.style.display = "none";
  };

  // Load Assignments
  async function loadAssignments() {
    try {
      const data = await AttendanceApi.listAssignments();
      allAssignments = data.assignments || [];
      populateFilters(allAssignments);
      updateStats(allAssignments);
      applyFilters();
    } catch (error) {
      console.error("Failed to load assignments", error);
    }
  }

  function updateStats(assignments) {
    const totalEl = document.getElementById("totalAssignmentsCount");
    const subEl = document.getElementById("totalSubmissionsCount");
    const pendEl = document.getElementById("pendingGradingCount");

    if (totalEl) totalEl.textContent = assignments.length;
    
    AttendanceApi.listSubmissions().then(data => {
      const subs = data.submissions || [];
      if (subEl) subEl.textContent = subs.length;
      if (pendEl) pendEl.textContent = subs.filter(s => !s.grade).length;
    }).catch(err => console.error("Stats error", err));
  }

  function populateFilters(assignments) {
    if (!classFilter || !subjectFilter) return;

    const classes = [...new Set(assignments.map(a => a.class_name).filter(Boolean))];
    const subjects = [...new Set(assignments.map(a => a.subject).filter(Boolean))];

    const currentClass = classFilter.value;
    const currentSubject = subjectFilter.value;

    classFilter.innerHTML = '<option value="">All Classes</option>';
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      classFilter.appendChild(opt);
    });

    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    subjects.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      subjectFilter.appendChild(opt);
    });

    classFilter.value = currentClass;
    subjectFilter.value = currentSubject;
  }

  function applyFilters() {
    if (!classFilter || !subjectFilter) return;
    const cVal = classFilter.value;
    const sVal = subjectFilter.value;

    const filtered = allAssignments.filter(a => {
      const matchClass = !cVal || a.class_name === cVal;
      const matchSub = !sVal || a.subject === sVal;
      return matchClass && matchSub;
    });

    renderAssignments(filtered);
  }

  if (classFilter) classFilter.onchange = applyFilters;
  if (subjectFilter) subjectFilter.onchange = applyFilters;

  const SUBJECT_ICONS = {
    math: "📐",
    mathematics: "📐",
    science: "🔬",
    physics: "⚛️",
    chemistry: "🧪",
    computer: "💻",
    cs: "💻",
    english: "📚",
    history: "📜",
    art: "🎨",
    music: "🎵",
    default: "📝"
  };

  function getSubjectIcon(subject = "") {
    const s = String(subject).toLowerCase();
    return SUBJECT_ICONS[s] || SUBJECT_ICONS.default;
  }

  async function renderAssignments(assignments) {
    const grid = document.getElementById("assignmentsGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (assignments.length === 0) {
      grid.innerHTML = `
        <div class='empty-msg'>
          <h4>✨ No assignments yet or none match filters</h4>
          <p>Click 'Add New Assignment' above to create your first task.</p>
        </div>`;
      return;
    }

    // Fetch submission counts for cards
    let allSubs = [];
    try {
      const subData = await AttendanceApi.listSubmissions();
      allSubs = subData.submissions || [];
    } catch(err) { console.error("Could not fetch submissions for cards", err); }

    assignments.forEach((assign, index) => {
      const subCount = allSubs.filter(s => s.assignment_id === assign.id).length;
      const subPending = allSubs.filter(s => s.assignment_id === assign.id && !s.grade).length;
      const subjectClass = assign.subject ? `subject-${assign.subject.toLowerCase()}` : 'subject-default';
      const icon = getSubjectIcon(assign.subject);

      const card = document.createElement("div");
      card.className = `assignment-card ${subjectClass}`;
      card.style.animationDelay = `${index * 0.1}s`;
      card.innerHTML = `
        <div class="card-header">
          <span class="subject-tag">${icon} ${assign.subject || 'General'}</span>
          <span class="class-badge">${assign.class_name || 'All Classes'}</span>
        </div>
        <h3>${assign.title}</h3>
        <p class="desc">${assign.description || "No description provided."}</p>
        
        <div class="card-stats">
          <div class="stat">
            <span class="label">Submissions</span>
            <span class="val">${subCount}</span>
          </div>
          <div class="stat">
            <span class="label">Pending</span>
            <span class="val">${subPending}</span>
          </div>
          <div class="stat">
            <span class="label">Deadline</span>
            <div class="deadline-info">📅 ${assign.deadline}</div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-primary view-subs" data-id="${assign.id}">View & Grade</button>
          <button class="btn-danger-icon delete-assign" data-id="${assign.id}" title="Delete">🗑️</button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Event Listeners
    document.querySelectorAll(".view-subs").forEach(btn => {
      btn.onclick = () => openSubmissions(btn.dataset.id);
    });

    document.querySelectorAll(".delete-assign").forEach(btn => {
      btn.onclick = async () => {
        if (confirm("Are you sure you want to delete this assignment?")) {
          try {
            await AttendanceApi.deleteAssignment(btn.dataset.id);
            loadAssignments();
          } catch (error) {
            alert("Error deleting: " + error.message);
          }
        }
      };
    });
  }

  async function openSubmissions(assignmentId) {
    try {
      const data = await AttendanceApi.listSubmissions({ assignment_id: assignmentId });
      renderSubmissions(data.submissions || []);
      submissionsModal.style.display = "block";
    } catch (error) {
      alert("Error loading submissions: " + error.message);
    }
  }

  function renderSubmissions(submissions) {
    if (!submissionsBody) return;
    submissionsBody.innerHTML = "";
    if (submissions.length === 0) {
      submissionsBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No submissions yet</td></tr>";
      return;
    }
    submissions.forEach(sub => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${sub.student_roll}</td>
        <td>${sub.student_name}</td>
        <td>${sub.submitted_at}</td>
        <td><div class="content-preview" style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sub.content}</div></td>
        <td><span class="badge ${sub.grade ? 'success' : 'warning'}" style="padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">${sub.grade || "Ungraded"}</span></td>
        <td><button class="btn-secondary grade-btn" data-id="${sub.id}" data-grade="${sub.grade || ""}" data-feedback="${sub.feedback || ""}" style="padding: 4px 8px; border-radius: 6px;">Grade</button></td>
      `;
      submissionsBody.appendChild(tr);
    });

    document.querySelectorAll(".grade-btn").forEach(btn => {
      btn.onclick = () => {
        document.getElementById("gradeSubId").value = btn.dataset.id;
        document.getElementById("subGrade").value = btn.dataset.grade;
        document.getElementById("subFeedback").value = btn.dataset.feedback;
        gradeModal.style.display = "block";
      };
    });
  }

  // Create Assignment
  if (assignmentForm) {
    assignmentForm.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        title: document.getElementById("assignTitle").value,
        description: document.getElementById("assignDesc").value,
        subject: document.getElementById("assignSubject").value,
        class: document.getElementById("assignClass").value,
        deadline: document.getElementById("assignDeadline").value
      };

      try {
        await AttendanceApi.createAssignment(body);
        assignmentModal.style.display = "none";
        assignmentForm.reset();
        loadAssignments();
      } catch (error) {
        alert("Error creating assignment: " + error.message);
      }
    };
  }

  // Grade Submission
  if (gradeForm) {
    gradeForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("gradeSubId").value;
      const body = {
        grade: document.getElementById("subGrade").value,
        feedback: document.getElementById("subFeedback").value
      };

      try {
        await AttendanceApi.gradeSubmission(id, body);
        gradeModal.style.display = "none";
        loadAssignments();
      } catch (error) {
        alert("Error grading submission: " + error.message);
      }
    };
  }

  loadAssignments();
});
