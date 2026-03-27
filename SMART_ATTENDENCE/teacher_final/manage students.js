let uploadedPhoto = "";

document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  const form = document.getElementById("studentForm");
  const tableBody = document.getElementById("studentTableBody");
  const photoInput = document.getElementById("photo");
  const photoPreview = document.getElementById("photoPreview");
  const searchInput = document.getElementById("searchInput");
  const resetBtn = document.getElementById("resetBtn");
  const csvFile = document.getElementById("csvFile");
  const formTitle = document.getElementById("formTitle");
  const saveBtn = document.getElementById("saveBtn");
  const passwordInput = document.getElementById("password");

  const drawer = document.getElementById("studentDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const openDrawerBtn = document.getElementById("openDrawerBtn");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const totalCountEl = document.getElementById("totalCount");
  const classCountEl = document.getElementById("classCount");

  let students = [];
  let editingRoll = null;

  try {
    await AttendanceApi.syncLegacyData();
    await refreshStudents();
  } catch (error) {
    alert(error.message);
    return;
  }

  // DRAWER TOGGLES
  openDrawerBtn.addEventListener("click", () => {
    resetForm();
    openDrawer();
  });

  closeDrawerBtn.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  function openDrawer() {
    drawer.classList.add("active");
    drawerOverlay.classList.add("active");
  }

  function closeDrawer() {
    drawer.classList.remove("active");
    drawerOverlay.classList.remove("active");
  }

  photoInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      uploadedPhoto = event.target.result;
      photoPreview.src = uploadedPhoto;
    };
    reader.readAsDataURL(file);
  });

  searchInput.addEventListener("input", renderTable);
  resetBtn.addEventListener("click", resetForm);
  csvFile.addEventListener("change", importCsvFile);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const rollValue = document.getElementById("roll").value.toString().trim();
    const duplicate = students.some(student =>
      student.roll === rollValue && student.roll !== editingRoll
    );

    if (duplicate) {
      alert("Roll number already exists in the system!");
      return;
    }

    const studentData = normalizeStudent({
      photo: uploadedPhoto,
      roll: rollValue,
      name: document.getElementById("name").value,
      email: document.getElementById("email").value,
      password: passwordInput.value,
      phone: document.getElementById("phone").value,
      course: document.getElementById("course").value,
      year: document.getElementById("year").value,
      semester: document.getElementById("semester").value,
      class: document.getElementById("class").value,
      address: document.getElementById("address").value
    });

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      if (editingRoll) {
        await AttendanceApi.updateStudent(editingRoll, studentData);
      } else {
        await AttendanceApi.createStudent(studentData);
      }

      await refreshStudents();
      resetForm();
      closeDrawer();
    } catch (error) {
      alert(error.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  tableBody.addEventListener("click", async event => {
    const editBtn = event.target.closest(".edit-btn");
    const deleteBtn = event.target.closest(".delete-btn");

    if (editBtn) {
      const roll = editBtn.dataset.roll;
      const student = students.find(candidate => candidate.roll === roll);
      if (!student) return;

      uploadedPhoto = student.photo;
      photoPreview.src = uploadedPhoto || "../images/placeholder.png";

      document.getElementById("roll").value = student.roll;
      document.getElementById("name").value = student.name;
      document.getElementById("email").value = student.email;
      passwordInput.value = "";
      passwordInput.placeholder = "Leave blank to keep current";
      
      document.getElementById("phone").value = student.phone;
      document.getElementById("course").value = student.course;
      document.getElementById("year").value = student.year;
      document.getElementById("semester").value = student.semester;
      document.getElementById("class").value = student.class;
      document.getElementById("address").value = student.address;

      editingRoll = student.roll;
      formTitle.textContent = "Update Student Record";
      saveBtn.textContent = "Update Details";
      openDrawer();
      return;
    }

    if (deleteBtn) {
      const roll = deleteBtn.dataset.roll;
      const student = students.find(candidate => candidate.roll === roll);
      if (!student) return;

      if (confirm(`Are you sure you want to delete student ${student.name} (${student.roll})?`)) {
        try {
          await AttendanceApi.deleteStudent(student.roll);
          await refreshStudents();
        } catch (error) {
          alert(error.message);
        }
      }
    }
  });

  async function refreshStudents() {
    try {
      students = (await AttendanceApi.listStudents())
        .map(normalizeStudent)
        .sort((left, right) =>
          left.roll.localeCompare(right.roll, undefined, { numeric: true, sensitivity: "base" })
        );
      
      // Update Stats
      totalCountEl.textContent = students.length;
      const uniqueClasses = new Set(students.map(s => s.class).filter(c => c && c !== "--"));
      classCountEl.textContent = uniqueClasses.size;

      renderTable();
    } catch (error) {
      console.error("Failed to refresh students:", error);
    }
  }

  function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    tableBody.innerHTML = "";
    let hasMatches = false;

    students.forEach(student => {
      const haystack = [student.roll, student.name, student.class, student.course].join(" ").toLowerCase();
      if (query && !haystack.includes(query)) return;

      hasMatches = true;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div class="student-info">
            <img src="${student.photo || ""}" class="student-avatar" onerror="this.src='../images/placeholder.png'">
            <div>
              <div class="student-name">${student.name}</div>
              <div class="student-roll">#${student.roll}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600;">${student.course || "General"}</div>
          <div style="font-size: 11px; color: var(--text-muted);">Academics</div>
        </td>
        <td>
          <span class="badge badge-blue">Class: ${student.class || "--"}</span>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Yr ${student.year || "-"}, Sem ${student.semester || "-"}</div>
        </td>
        <td>
          <div style="font-size: 13px; font-weight: 500; color: #10b981;">Active</div>
        </td>
        <td style="text-align: right;">
          <div class="action-icons" style="justify-content: flex-end;">
            <button data-roll="${student.roll}" class="edit-btn" title="Edit">✏️</button>
            <button data-roll="${student.roll}" class="delete-btn" title="Delete">🗑️</button>
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });

    if (!hasMatches) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">No student records match your filters.</td></tr>`;
    }
  }

  async function importCsvFile(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async loadEvent => {
      try {
        const importedRows = parseCsv(String(loadEvent.target?.result || ""));
        if (importedRows.length === 0) {
          alert("The CSV file is empty.");
          return;
        }

        const importedStudents = importedRows
          .map(mapCsvRowToStudent)
          .filter(student => student.roll && student.name);

        if (importedStudents.length === 0) {
          alert("No valid student rows were found in the CSV file.");
          return;
        }

        await AttendanceApi.importStudents(importedStudents);
        await refreshStudents();
        alert(`${importedStudents.length} student record(s) imported successfully.`);
      } catch (error) {
        alert(`CSV import failed: ${error.message}`);
      } finally {
        csvFile.value = "";
      }
    };

    reader.onerror = () => {
      alert("Unable to read the selected CSV file.");
      csvFile.value = "";
    };

    reader.readAsText(file);
  }

  function resetForm() {
    editingRoll = null;
    uploadedPhoto = "";
    form.reset();
    photoPreview.src = "";
    passwordInput.placeholder = "Portal Password";
    formTitle.textContent = "Add Student";
    saveBtn.textContent = "Add Student";
  }

  function parseCsv(csvText) {
    const rows = [];
    let currentCell = "";
    let currentRow = [];
    let insideQuotes = false;

    for (let index = 0; index < csvText.length; index++) {
      const char = csvText[index];
      const nextChar = csvText[index + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"';
          index++;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === "," && !insideQuotes) {
        currentRow.push(currentCell);
        currentCell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index++;
        }

        currentRow.push(currentCell);
        if (currentRow.some(cell => cell.trim() !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
        continue;
      }

      currentCell += char;
    }

    currentRow.push(currentCell);
    if (currentRow.some(cell => cell.trim() !== "")) {
      rows.push(currentRow);
    }

    if (rows.length === 0) {
      return [];
    }

    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map(row => {
      const entry = {};
      headers.forEach((header, headerIndex) => {
        if (!header) {
          return;
        }
        entry[header] = String(row[headerIndex] ?? "").trim();
      });
      return entry;
    });
  }

  function mapCsvRowToStudent(row) {
    const roll = row.roll || row.rollno || row.admissionno;
    const name = row.name || row.studentname || row.fullname;

    return normalizeStudent({
      photo: row.photo || row.image || "",
      roll,
      name,
      email: row.email,
      password: row.password || row.portalpassword,
      phone: row.phone || row.mobile,
      course: row.course || row.stream,
      year: row.year,
      semester: row.semester,
      class: row.class || row.section || row.division,
      address: row.address,
      hasPassword: Boolean(row.password || row.portalpassword)
    });
  }

  function normalizeHeader(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normalizeStudent(student) {
    return {
      photo: String(student.photo ?? "").trim(),
      roll: String(student.roll ?? "").trim(),
      name: String(student.name ?? "").trim(),
      email: String(student.email ?? "").trim(),
      password: String(student.password ?? "").trim(),
      hasPassword: Boolean(student.hasPassword),
      phone: String(student.phone ?? "").trim(),
      course: String(student.course ?? "").trim(),
      year: String(student.year ?? "").trim(),
      semester: String(student.semester ?? "").trim(),
      class: String(student.class ?? "").trim(),
      address: String(student.address ?? "").trim()
    };
  }
});
