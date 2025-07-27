// Handle contact form submission
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    const notifyBtn = document.getElementById('sendNotifications');
    const notifyStatus = document.getElementById('notifyStatus');
    const completedBtn = document.getElementById('markCompleted');
    let lastNotificationTimestamp = null;

    // Prefill form if contact info exists
    const contact = window.userContact ? window.userContact.getUserContact() : {};
    if (contact && contact.email) document.getElementById('email').value = contact.email;
    if (contact && contact.phone) document.getElementById('phone').value = contact.phone;

    // Display saved contact info on home page
    function displayContactInfo() {
        const infoBox = document.getElementById('contact-info-box');
        if (contact && contact.email && contact.phone) {
infoBox.innerHTML = `
  <div style="
    background-color: #f5f5f5;
    color: #333;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    font-family: 'Segoe UI', sans-serif;
    line-height: 1.6;
    max-width: 400px;
  ">
    <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem;">
      🔔 Notifications will be sent to:
    </div>
    <div><strong>Email:</strong> <span style="color:#3f51b5;">${contact.email}</span></div>
    <div><strong>Phone:</strong> <span style="color:#388e3c;">${contact.phone}</span></div>
  </div>
`;
            infoBox.style.display = 'block';
        } else {
            infoBox.innerHTML = '';
            infoBox.style.display = 'none';
        }
    }
    displayContactInfo();

    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const emailInput = document.getElementById('email');
            const phoneInput = document.getElementById('phone');
            const email = emailInput.value;
            const phone = phoneInput.value;
            if (window.userContact) window.userContact.setUserContact(email, phone);
            await fetch('http://localhost:3000/save-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone })
            });
            notifyStatus.textContent = 'Contact info saved!';
            notifyStatus.style.color = 'green';
            contact.email = email;
            contact.phone = phone;
            displayContactInfo();
            // Clear input fields after saving
            emailInput.value = '';
            phoneInput.value = '';
        });
    }

    // Automatically send notifications daily at 8am
    async function autoSendNotifications() {
        const contact = window.userContact ? window.userContact.getUserContact() : {};
        if (!contact.email || !contact.phone) return;
        const subjects = await getSubjects();
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayStr = today.toISOString().slice(0, 10);
        const dueSubjects = subjects.filter(sub => {
            if (sub.manualReviewDate && sub.manualReviewDate === todayStr) return true;
            if (sub.nextReview) {
                const nextReviewDateStr = new Date(sub.nextReview).toISOString().slice(0, 10);
                if (nextReviewDateStr === todayStr || new Date(sub.nextReview).getTime() <= today.getTime()) return true;
            }
            return false;
        });
        if (dueSubjects.length === 0) return;
        await fetch('http://localhost:3000/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: contact.email,
                phone: contact.phone,
                subjects: dueSubjects.map(s => s.name)
            })
        });
    }
    // Schedule auto notification at 8am every day
    function scheduleDailyNotification() {
        const now = new Date();
        const next8am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
        if (now > next8am) next8am.setDate(next8am.getDate() + 1);
        const msUntil8am = next8am.getTime() - now.getTime();
        setTimeout(() => {
            autoSendNotifications();
            setInterval(autoSendNotifications, 24 * 60 * 60 * 1000);
        }, msUntil8am);
    }
    scheduleDailyNotification();
    if (completedBtn) completedBtn.style.display = 'none';
});
document.addEventListener('DOMContentLoaded', () => {
    console.log('Spaced Repetition App Ready!');

    const form = document.getElementById('subject-form');
    const subjectsList = document.getElementById('subjects-list');
    const backupButton = document.getElementById('backup-button');
    const importFile = document.getElementById('import-file');
    const searchInput = document.getElementById('search-input');
    const notificationSound = document.getElementById('notification-sound');
    const notificationsContainer = document.getElementById('notifications');
    const statsChartCanvas = document.getElementById('statsChart').getContext('2d');
    const pieChartCanvas = document.getElementById('pieChart').getContext('2d');
    const themeSelect = document.getElementById('theme-select');
    const homeTotalSubjects = document.getElementById('home-total-subjects');
    const homeReviewedSubjects = document.getElementById('home-reviewed-subjects');
    const homeRemainingSubjects = document.getElementById('home-remaining-subjects');
    let statsChart;
    let pieChart;

    const currentLanguage = 'en';

    const translations = {
        en: {
            totalSubjects: "Total Subjects:",
            reviewedSubjects: "Reviewed Subjects:",
            remainingSubjects: "Remaining Subjects:",
            statsTitle: "Performance Stats",
            addButton: "Add Subject",
            backupSuccess: "Backup completed successfully",
            importSuccess: "Data imported successfully",
            reviewSubject: "Review Subject",
            updateSubject: "Updated",
            deleteSubject: "Deleted"
        }
    };

    const dbPromise = idb.openDB('subjects-db', 1, {
        upgrade(db) {
            db.createObjectStore('subjects', {
                keyPath: 'id',
                autoIncrement: true
            });
        }
    });

    async function getSubjects() {
        const db = await dbPromise;
        return db.getAll('subjects');
    }

    async function addSubject(subject) {
        const db = await dbPromise;
        await db.add('subjects', subject);
    }

    async function updateSubject(id, updates) {
        const db = await dbPromise;
        const subject = await db.get('subjects', id);
        Object.assign(subject, updates);
        await db.put('subjects', subject);
    }

    async function deleteSubject(id) {
        const db = await dbPromise;
        await db.delete('subjects', id);
    }

    async function renderSubjects(subjects) {
    subjectsList.innerHTML = '';
    subjects.sort((a, b) => {
        // Sort by manualReviewDate if present, else by nextReview
        const aDate = a.manualReviewDate ? new Date(a.manualReviewDate + 'T00:00:00').getTime() : a.nextReview;
        const bDate = b.manualReviewDate ? new Date(b.manualReviewDate + 'T00:00:00').getTime() : b.nextReview;
        return aDate - bDate;
    });

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0, 10);

    subjects.forEach(subject => {
        const li = document.createElement('li');
        let completed = subject.reviewCompleted;
        let reviewInfo = '';
        // Only show one review date: manual if present, else auto
        if (subject.manualReviewDate) {
            const manualDateStr = subject.manualReviewDate;
            const manualDateDisplay = new Date(manualDateStr + 'T00:00:00').toLocaleDateString();
            reviewInfo = `Manual Review: ${manualDateDisplay}`;
            // Highlight if due today
            if (manualDateStr === todayStr) {
                reviewInfo += ' <span style="color:#e67e22;font-weight:600;">(Due Today)</span>';
            }
        } else if (subject.nextReview) {
            const nextReviewDateStr = new Date(subject.nextReview).toISOString().slice(0, 10);
            const nextReviewDisplay = new Date(subject.nextReview).toLocaleDateString();
            reviewInfo = `Auto Review: ${nextReviewDisplay}`;
            if (nextReviewDateStr === todayStr || new Date(subject.nextReview).getTime() <= today.getTime()) {
                reviewInfo += ' <span style="color:#e67e22;font-weight:600;">(Due Today)</span>';
            }
        } else {
            reviewInfo = 'No Review Date';
        }
        li.innerHTML = `
            ${subject.name} - ${subject.details} - ${reviewInfo}
            <div class="review-buttons">
                <button class="review-button" data-id="${subject.id}" data-score="1"><i class="fas fa-check"></i> Good</button>
                <button class="review-button" data-id="${subject.id}" data-score="2"><i class="fas fa-star"></i> Excellent</button>
                <button class="mark-completed-button" data-id="${subject.id}" ${completed ? 'disabled style="background:#28a745;color:#fff;opacity:0.7;"' : ''}>
                  <i class="fas fa-check-double"></i> ${completed ? 'Completed' : 'Mark Review Completed'}
                </button>
                <button class="delete-subject-button" data-id="${subject.id}" style="background:#dc3545;color:#fff;margin-left:10px;">Delete</button>
            </div>
            ${completed ? '<span style="color:#28a745;font-weight:600;margin-left:10px;">Review Completed</span>' : ''}
        `;
        subjectsList.appendChild(li);
    });
    }

    async function updateStats() {
        const subjects = await getSubjects();
        const totalSubjects = subjects.length;
        const reviewedSubjects = subjects.filter(subject => subject.repeatCount > 0).length;
        // Count subjects due today (manual or auto)
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayStr = today.toISOString().slice(0, 10);
        const dueTodaySubjects = subjects.filter(subject => {
            if (subject.manualReviewDate && subject.manualReviewDate === todayStr) return true;
            if (subject.nextReview) {
                const nextReviewDateStr = new Date(subject.nextReview).toISOString().slice(0, 10);
                if (nextReviewDateStr === todayStr || new Date(subject.nextReview).getTime() <= today.getTime()) return true;
            }
            return false;
        });
        const remainingSubjects = dueTodaySubjects.length;

        document.getElementById('totalSubjects').textContent = totalSubjects;
        document.getElementById('reviewsToday').textContent = reviewedSubjects;
        document.getElementById('reviewsCompleted').textContent = remainingSubjects;

        homeTotalSubjects.textContent = totalSubjects;
        homeReviewedSubjects.textContent = reviewedSubjects;
        homeRemainingSubjects.textContent = remainingSubjects;

        updateBarChart(totalSubjects, reviewedSubjects, remainingSubjects);
        updatePieChart(totalSubjects, reviewedSubjects, remainingSubjects);
    }

    function updateBarChart(total, reviewed, remaining) {
        if (statsChart) statsChart.destroy();

        statsChart = new Chart(statsChartCanvas, {
            type: 'bar',
            data: {
                labels: [
                    translations.en.totalSubjects,
                    translations.en.reviewedSubjects,
                    translations.en.remainingSubjects
                ],
                datasets: [{
                    label: translations.en.statsTitle,
                    data: [total, reviewed, remaining],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.2)',
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 206, 86, 0.2)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    function updatePieChart(total, reviewed, remaining) {
        if (pieChart) pieChart.destroy();

        pieChart = new Chart(pieChartCanvas, {
            type: 'pie',
            data: {
                labels: [
                    translations.en.totalSubjects,
                    translations.en.reviewedSubjects,
                    translations.en.remainingSubjects
                ],
                datasets: [{
                    label: translations.en.statsTitle,
                    data: [total, reviewed, remaining],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.2)',
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 206, 86, 0.2)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function (tooltipItem) {
                                return `${tooltipItem.label}: ${tooltipItem.raw}`;
                            }
                        }
                    }
                }
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = form.subject.value;
        const details = form.details.value;
        const manualReviewInput = form.querySelector('[name="manualReviewDate"]');
        let manualReviewDate = '';
        if (manualReviewInput && manualReviewInput.value) {
            // Convert dd-mm-yyyy to yyyy-mm-dd
            const parts = manualReviewInput.value.split('-');
            if (parts.length === 3) {
                // If input is dd-mm-yyyy, convert to yyyy-mm-dd
                if (parts[2].length === 4) {
                    manualReviewDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                } else {
                    manualReviewDate = manualReviewInput.value; // fallback
                }
            } else {
                manualReviewDate = manualReviewInput.value;
            }
        }
        const repeatCount = 0;
        let newSubject;
        if (manualReviewDate) {
            newSubject = { name, details, manualReviewDate, repeatCount };
        } else {
            const nextReview = Date.now() + 24 * 60 * 60 * 1000;
            newSubject = { name, details, nextReview, repeatCount };
        }

        await addSubject(newSubject);
        const subjects = await getSubjects();
        await renderSubjects(subjects);
        await updateStats();

        form.reset();
        showNotification(translations.en.addButton, 'success');

        // Switch to subjects section after adding
        document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
        document.getElementById('subjects').classList.add('active');
        document.querySelectorAll('.nav-link').forEach(nav => nav.classList.remove('active'));
        document.querySelector('.nav-link[data-section="subjects"]').classList.add('active');
    });

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        notificationsContainer.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);

        if (type === 'info') {
            notificationSound.play();
        }
    }

    async function checkForReviews() {
    const now = Date.now();
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayTime = today.getTime();
    const todayStr = today.toISOString().slice(0, 10);
    const subjects = await getSubjects();
    let dueSubjects = [];
    subjects.forEach(subject => {
        if (subject.manualReviewDate) {
            const manualTime = new Date(subject.manualReviewDate + 'T00:00:00').getTime();
            if (manualTime === todayTime) {
                showNotification(`${translations.en.reviewSubject}: ${subject.name}`, 'info');
                dueSubjects.push(subject.name);
            }
        } else if (now >= subject.nextReview) {
            showNotification(`${translations.en.reviewSubject}: ${subject.name}`, 'info');
            dueSubjects.push(subject.name);
        }
    });
    // If there are due subjects, send SMS via backend
    if (dueSubjects.length > 0) {
        const contact = window.userContact ? window.userContact.getUserContact() : {};
        if (contact && contact.email && contact.phone) {
            try {
                await fetch('http://localhost:3000/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: contact.email,
                        phone: contact.phone,
                        subjects: dueSubjects
                    })
                });
            } catch (e) {
                // Optionally show error notification
                showNotification('SMS send error: ' + e.message, 'error');
            }
        }
    }
    }

    setInterval(checkForReviews, 60 * 1000);

    subjectsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('review-button')) {
        const id = parseInt(e.target.dataset.id);
        const score = parseInt(e.target.dataset.score);

        const subjects = await getSubjects();
        const subject = subjects.find(sub => sub.id === id);
        const now = Date.now();

        if (score === 1) {
            subject.nextReview = now + 2 * 24 * 60 * 60 * 1000;
        } else if (score === 2) {
            subject.nextReview = now + 4 * 24 * 60 * 60 * 1000;
        }

        subject.repeatCount += 1;

        if (subject.repeatCount >= 5) {
            await deleteSubject(id);
            showNotification(`${translations.en.deleteSubject}: ${subject.name}`, 'success');
        } else {
            await updateSubject(id, {
                nextReview: subject.nextReview,
                repeatCount: subject.repeatCount
            });
            showNotification(`${translations.en.updateSubject}: ${subject.name}`, 'success');
        }

        const updatedSubjects = await getSubjects();
        await renderSubjects(updatedSubjects);
        await updateStats();
    }
    // Handle Delete Subject button
    if (e.target.classList.contains('delete-subject-button')) {
        const id = parseInt(e.target.dataset.id);
        const subjects = await getSubjects();
        const subject = subjects.find(sub => sub.id === id);
        await deleteSubject(id);
        showNotification(`Deleted: ${subject.name}`, 'success');
        const updatedSubjects = await getSubjects();
        await renderSubjects(updatedSubjects);
        await updateStats();
    }
    // Handle Mark Review Completed button
    if (e.target.classList.contains('mark-completed-button')) {
        const id = parseInt(e.target.dataset.id);
        const subjects = await getSubjects();
        const subject = subjects.find(sub => sub.id === id);
        // Mark locally (could add a completed flag)
        subject.reviewCompleted = true;
        await updateSubject(id, subject);
        showNotification(`Marked review completed for: ${subject.name}`, 'success');
        // Optionally notify backend for email suppression
        const contact = window.userContact ? window.userContact.getUserContact() : {};
        await fetch('http://localhost:3000/review-completed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: contact.email,
                subjects: [subject.name],
                timestamp: Date.now()
            })
        });
        // Immediately re-render subjects and update stats
        const updatedSubjects = await getSubjects();
        await renderSubjects(updatedSubjects);
        await updateStats();
    }
    });

    searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const subjects = await getSubjects();
        const filtered = subjects.filter(subject =>
            subject.name.toLowerCase().includes(searchTerm) ||
            subject.details.toLowerCase().includes(searchTerm)
        );
        await renderSubjects(filtered);
    });

    backupButton.addEventListener('click', async () => {
        const subjects = await getSubjects();
        const dataStr = JSON.stringify(subjects);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subjects_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showNotification(translations.en.backupSuccess, 'success');
    });

    importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            const importedSubjects = JSON.parse(event.target.result);
            const db = await dbPromise;
            const tx = db.transaction('subjects', 'readwrite');
            const store = tx.objectStore('subjects');
            await store.clear();
            for (const subject of importedSubjects) {
                await store.add(subject);
            }
            await tx.done;
            const subjects = await getSubjects();
            await renderSubjects(subjects);
            await updateStats();
            showNotification(translations.en.importSuccess, 'success');
        };
        reader.readAsText(file);
    });

    themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        if (theme === 'dark') {
            document.body.className = 'dark-theme';
        } else {
            document.body.className = '';
        }
        localStorage.setItem('theme', theme);
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.className = 'dark-theme';
    } else {
        document.body.className = '';
    }
    themeSelect.value = savedTheme;

    async function init() {
        const subjects = await getSubjects();
        await renderSubjects(subjects);
        await updateStats();
    }

    init();

    // Navigation
    document.querySelectorAll('nav ul li a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.closest('a').dataset.section;
            if (section) {
                document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
                document.getElementById(section).classList.add('active');
            }
        });
    });

    // ✅ Reset Data Button Functionality using IndexedDB
    document.getElementById('reset-data').addEventListener('click', async () => {
        if (confirm("Are you sure you want to delete all subjects? This cannot be undone.")) {
            const db = await dbPromise;
            const tx = db.transaction('subjects', 'readwrite');
            await tx.objectStore('subjects').clear();
            await tx.done;

            subjectsList.innerHTML = '';
            homeTotalSubjects.textContent = '0';
            homeReviewedSubjects.textContent = '0';
            homeRemainingSubjects.textContent = '0';

            // Reset contact info
            if (window.userContact) window.userContact.setUserContact('', '');
            if (document.getElementById('email')) document.getElementById('email').value = '';
            if (document.getElementById('phone')) document.getElementById('phone').value = '';
            // Hide contact info box
            const infoBox = document.getElementById('contact-info-box');
            if (infoBox) {
                infoBox.innerHTML = '';
                infoBox.style.display = 'none';
            }

            await updateStats();
            showNotification("All data and contact info reset.", 'success');
        }
    });
});
