// This service runs in Node.js and checks if subjects are still due for review by reading localStorage from the browser using Puppeteer.
// It responds to backend /check-due-subjects requests.

const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json());

// URL of your spaced repetition app (must be accessible from this service)
const APP_URL = 'http://localhost:5500'; // Change if needed

// Helper to check due subjects using Puppeteer
async function checkDueSubjects(subjects) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(APP_URL);
  // Get due subjects from localStorage in browser
  const dueSubjects = await page.evaluate((subjects) => {
    const allSubjects = JSON.parse(localStorage.getItem('subjects') || '[]');
    const today = new Date().toISOString().slice(0, 10);
    return allSubjects.filter(sub => subjects.includes(sub.name) && sub.nextReviewDate <= today).map(sub => sub.name);
  }, subjects);
  await browser.close();
  return dueSubjects;
}

app.post('/check-due-subjects', async (req, res) => {
  const { subjects } = req.body;
  try {
    const stillDue = await checkDueSubjects(subjects);
    res.json({ stillDue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(4000, () => console.log('Check service running on port 4000'));
