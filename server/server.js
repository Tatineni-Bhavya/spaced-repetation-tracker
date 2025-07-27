
require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());


// Twilio setup - credentials from environment variables
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE; // e.g. '+1234567890'
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

// SendGrid setup - API key from environment variable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL; // Must verify this in SendGrid

// Endpoint to send notifications
// In-memory store for pending notifications (for demo; use DB for production)
let pendingNotifications = [];
let completedReviews = [];


// Move this route below app initialization
// Endpoint to save contact info
app.post('/save-contact', (req, res) => {
  const { email, phone } = req.body;
  // For demo, just acknowledge receipt. In production, save to DB or session.
  res.status(200).json({ message: 'Contact info saved', email, phone });
});
app.post('/check-due-subjects', (req, res) => {
  const { subjects } = req.body;
  // This endpoint should be called by backend before sending email
  // The frontend should implement logic to check localStorage for due subjects
  // For demo, always return all subjects as due
  res.json({ stillDue: subjects });
});

// Endpoint to mark review as completed
app.post('/review-completed', (req, res) => {
  const { email, subjects, timestamp } = req.body;
  completedReviews.push({ email, subjects, timestamp });
  res.send('Review marked as completed');
});

app.post('/notify', async (req, res) => {
  const { email, phone, subjects } = req.body;
  const message = `Today you have to review these subjects: ${subjects.join(', ')}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Check if SMS already sent today for this user
  const alreadySent = pendingNotifications.find(n => n.email === email && n.phone === phone && n.date === todayStr);
  if (alreadySent) {
    return res.status(200).send('SMS already sent today.');
  }

  try {
    // Send SMS via Twilio first
    await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE,
      to: phone
    });

    // Store pending notification with today's date
    const notificationTimestamp = Date.now();
    pendingNotifications.push({ email, phone, subjects, timestamp: notificationTimestamp, date: todayStr });

    // Schedule email after 2 hours (7200000 ms)
    setTimeout(async () => {
      // Check if review was completed
      const completed = completedReviews.find(r => r.email === email && r.timestamp === notificationTimestamp);
      if (completed) {
        // Review was completed, do not send email
        return;
      }
      // Check with frontend if subjects are still due for review
      const fetch = require('node-fetch');
      try {
        const response = await fetch('http://localhost:3000/check-due-subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjects })
        });
        const result = await response.json();
        if (result.stillDue && result.stillDue.length > 0) {
          await sgMail.send({
            to: email,
            from: SENDER_EMAIL,
            subject: 'Review Reminder',
            text: message + '\n(You did not respond to the SMS reminder.)'
          });
        }
      } catch (e) {
        console.error('Error checking due subjects:', e);
      }
    }, 7200000); // 2 hours

    res.send('SMS sent! Email will be sent in 2 hours if not responded.');
  } catch (err) {
    res.status(500).send('Error sending notifications: ' + err.message);
  }
});

const path = require('path');
// Serve static files from root (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
