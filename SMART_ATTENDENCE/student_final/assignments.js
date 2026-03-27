document.addEventListener("DOMContentLoaded", async () => {
  const activeAssignments = document.getElementById("activeAssignments");
  const mySubmissions = document.getElementById("mySubmissions");
  const submitModal = document.getElementById("submitModal");
  const closeSubmit = document.getElementById("closeSubmit");
  const submissionForm = document.getElementById("submissionForm");

  const submitAssignIdInput = document.getElementById("submitAssignId");
  const subAassignTitleEl = document.getElementById("submitAassignTitle");
  const pendingCountEl = document.getElementById("pendingCount");

  // Load Assignments
  async function loadAssignments() {
    try {
      const { assignments } = await AttendanceApi.listAssignments();
      const { submissions } = await AttendanceApi.listSubmissions();
      
      const todo = (assignments || []).filter(a => !((submissions || []).find(s => s.assignment_id === a.id)));
      pendingCountEl.textContent = todo.length;

      renderAssignments(assignments || [], submissions || []);
      renderSubmissionsList(submissions || [], assignments || []);
    } catch (e) {
      console.error("Failed to load assignments", e);
    }
  }

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

  function renderAssignments(assignments, existingSubmissions) {
    activeAssignments.innerHTML = "";
    if (assignments.length === 0) {
      activeAssignments.innerHTML = `
        <div class='empty-msg'>
          <h4>✨ All caught up!</h4>
          <p>No active assignments found in your record. Great job!</p>
        </div>`;
      return;
    }

    assignments.forEach((assign, index) => {
      const alreadySubmitted = existingSubmissions.find(s => s.assignment_id === assign.id);
      const subjectClass = assign.subject ? `subject-${assign.subject.toLowerCase()}` : 'subject-default';
      const icon = getSubjectIcon(assign.subject);
      
      const card = document.createElement("div");
      card.className = `assignment-card ${subjectClass}`;
      card.style.animationDelay = `${index * 0.1}s`;
      card.innerHTML = `
        <div class="subject-tag">${icon} ${assign.subject || 'General'}</div>
        <h4>${assign.title}</h4>
        <p class="desc">${assign.description || "No description provided."}</p>
        <div class="card-footer">
          <span class="deadline"><i>📅</i> ${assign.deadline || 'No Deadline'}</span>
          ${alreadySubmitted 
            ? `<span class="badge success"><i>✅</i> Submitted</span>` 
            : `<button class="primary-btn submit-btn" data-id="${assign.id}" data-title="${assign.title}">Submit Now</button>`
          }
        </div>
      `;
      activeAssignments.appendChild(card);
    });

    // Listeners
    document.querySelectorAll(".submit-btn").forEach(btn => {
      btn.onclick = () => {
        submitAssignIdInput.value = btn.dataset.id;
        subAassignTitleEl.textContent = btn.dataset.title;
        submitModal.classList.add("show");
      };
    });
  }

  function renderSubmissionsList(submissions, assignments) {
    mySubmissions.innerHTML = "";
    if (submissions.length === 0) {
      mySubmissions.innerHTML = `
        <div class='empty-msg'>
          <h4>No history yet</h4>
          <p>Your completed tasks and marks will appear here.</p>
        </div>`;
      return;
    }

    submissions.forEach((sub, index) => {
      const assign = assignments.find(a => a.id === sub.assignment_id);
      const subjectClass = (assign && assign.subject) ? `subject-${assign.subject.toLowerCase()}` : 'subject-default';
      const icon = getSubjectIcon(assign ? assign.subject : "");
      
      const card = document.createElement("div");
      card.className = `submission-card ${subjectClass}`;
      card.style.animationDelay = `${index * 0.1}s`;
      card.innerHTML = `
        <div class="subject-tag">${icon} ${assign ? assign.subject : 'Misc'}</div>
        <h4>${assign ? assign.title : "Deleted Assignment"}</h4>
        <p class="date"><i>🕒</i> Submitted: ${sub.submitted_at}</p>
        <div class="preview">${sub.content}</div>
        <div class="card-footer">
          ${sub.grade 
            ? `<div class="grade-box">
                 <span class="label">Teacher's Grade</span>
                 <span class="val">${sub.grade}</span>
               </div>` 
            : `<span class="badge warning"><i>⏳</i> Wait for review</span>`
          }
        </div>
      `;
      mySubmissions.appendChild(card);
    });
  }

  // Submission Form
  submissionForm.onsubmit = async (e) => {
    e.preventDefault();
    const assignment_id = submitAssignIdInput.value;
    const content = document.getElementById("subContent").value;

    try {
      await AttendanceApi.submitAssignment({ assignment_id, content });
      submitModal.classList.remove("show");
      submissionForm.reset();
      loadAssignments();
    } catch (err) {
      alert("Submission failed: " + err.message);
    }
  };

  closeSubmit.onclick = () => submitModal.classList.remove("show");
  
  window.onclick = (e) => {
    if (e.target === submitModal) submitModal.classList.remove("show");
  };

  loadAssignments();
});
