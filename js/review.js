// Subject management and basic FSRS scheduling logic

// Helper: get today's date as YYYY-MM-DD
function getToday() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

// Add a new subject
function addSubject(name) {
    const subjects = getSubjects();
    subjects.push({
        name,
        reviewHistory: [],
        nextReviewDate: getToday(), // first review is today
        stability: 1, // initial stability
        difficulty: 1, // initial difficulty
        lastReviewDate: getToday()
    });
    saveSubjects(subjects);
}

// Get all subjects from localStorage
function getSubjects() {
    return JSON.parse(localStorage.getItem('subjects') || '[]');
}

// Save subjects to localStorage
function saveSubjects(subjects) {
    localStorage.setItem('subjects', JSON.stringify(subjects));
}

// Mark a subject as reviewed and update next review date using simple FSRS
function reviewSubject(index, rating = 'good') {
    const subjects = getSubjects();
    const subject = subjects[index];
    const today = getToday();
    // Calculate days since last review
    const lastReviewDate = new Date(subject.lastReviewDate);
    const now = new Date(today);
    const t = Math.round((now - lastReviewDate) / (1000 * 60 * 60 * 24));
    // Update stability and difficulty based on rating
    if (rating === 'good') {
        subject.stability *= 1.2; // increase by 20%
        subject.difficulty *= 0.95; // decrease by 5%
    } else {
        subject.stability *= 0.7; // decrease by 30%
        subject.difficulty *= 1.1; // increase by 10%
    }
    // Memory decay model: R = exp(-t/S)
    subject.retrievability = Math.exp(-t / subject.stability);
    // Next review interval is rounded stability
    const nextInterval = Math.max(1, Math.round(subject.stability));
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + nextInterval);
    subject.nextReviewDate = nextDate.toISOString().slice(0, 10);
    subject.lastReviewDate = today;
    subject.reviewHistory.push({ date: today, rating, stability: subject.stability, difficulty: subject.difficulty, retrievability: subject.retrievability });
    saveSubjects(subjects);
}

// Get subjects due for review today (by nextReviewDate or manualReviewDate)
function getDueSubjects() {
    const today = getToday();
    return getSubjects().filter(sub => {
        // Check both nextReviewDate and manualReviewDate
        const nextDue = sub.nextReviewDate && sub.nextReviewDate <= today;
        const manualDue = sub.manualReviewDate && sub.manualReviewDate <= today;
        return nextDue || manualDue;
    });
}

// Export functions for use in app.js
window.fsrs = {
    addSubject,
    getSubjects,
    saveSubjects,
    reviewSubject,
    getDueSubjects
};

// User contact management
function setUserContact(email, phone) {
    localStorage.setItem('userContact', JSON.stringify({ email, phone }));
}

function getUserContact() {
    return JSON.parse(localStorage.getItem('userContact') || '{}');
}

window.userContact = {
    setUserContact,
    getUserContact
};
