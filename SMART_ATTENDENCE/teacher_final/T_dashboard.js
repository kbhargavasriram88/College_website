document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  const totalClassesElement = document.getElementById("totalClasses");
  const totalStudentsElement = document.getElementById("totalStudents");
  const avgAttendanceElement = document.getElementById("avgAttendance");
  const lowAttendanceElement = document.getElementById("lowAttendance");

  let attendanceData = [];
  let students = [];

  try {
    await AttendanceApi.syncLegacyData();
    [attendanceData, students] = await Promise.all([
      AttendanceApi.listAttendance(),
      AttendanceApi.listStudents()
    ]);
  } catch (error) {
    updateStats("0", "0", "0%", "0");
    console.error(error);
    return;
  }

  // Process Stats
  const totalClasses = [...new Set(attendanceData.map(record => record.date))].length;
  const totalStudents = students.length;
  const studentMap = {};

  attendanceData.forEach(record => {
    if (!studentMap[record.roll]) {
      studentMap[record.roll] = { total: 0, present: 0 };
    }
    studentMap[record.roll].total++;
    if (record.status === "P") {
      studentMap[record.roll].present++;
    }
  });

  let totalPercent = 0;
  let lowCount = 0;
  const studentSummaries = Object.values(studentMap);

  studentSummaries.forEach(summary => {
    const percent = (summary.present / summary.total) * 100;
    totalPercent += percent;
    if (percent < 75) {
      lowCount++;
    }
  });

  const avgAttendance = studentSummaries.length === 0
    ? 0
    : Math.round(totalPercent / studentSummaries.length);

  updateStats(totalClasses, totalStudents, `${avgAttendance}%`, lowCount);

  // Chart Data Preparation
  const dateMap = {};
  attendanceData.forEach(record => {
    if (!dateMap[record.date]) {
      dateMap[record.date] = { total: 0, present: 0 };
    }
    dateMap[record.date].total++;
    if (record.status === "P") {
      dateMap[record.date].present++;
    }
  });

  const labels = Object.keys(dateMap).sort((a,b) => new Date(a) - new Date(b));
  const percentages = labels.map(date =>
    Math.round((dateMap[date].present / dateMap[date].total) * 100)
  );

  renderChart(labels, percentages);

  function updateStats(classes, studentsCount, avg, low) {
    if (totalClassesElement) totalClassesElement.textContent = classes;
    if (totalStudentsElement) totalStudentsElement.textContent = studentsCount;
    if (avgAttendanceElement) avgAttendanceElement.textContent = avg;
    if (lowAttendanceElement) lowAttendanceElement.textContent = low;
  }

  function renderChart(labels, percentages) {
    const ctx = document.getElementById("attendanceChart");
    if (!ctx || typeof Chart === "undefined") return;

    // Get primary color from CSS
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4f46e5';

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Attendance %",
          data: percentages,
          borderColor: primaryColor,
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: primaryColor,
          pointBorderColor: '#fff',
          pointHoverRadius: 6,
          pointRadius: 4,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            padding: 12,
            titleFont: { family: 'Outfit', size: 14 },
            bodyFont: { family: 'Outfit', size: 13 },
            callbacks: {
              label: (context) => ` Attendance: ${context.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
            ticks: {
              font: { family: 'Outfit', size: 12 },
              callback: value => `${value}%`
            }
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Outfit', size: 12 } }
          }
        }
      }
    });
  }
});
