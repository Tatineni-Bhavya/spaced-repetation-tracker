
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const { MongoClient } = require('mongodb');

// MongoDB setup
const MONGO_URI = process.env.MONGO_URI;
let db;

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MongoDB
if (MONGO_URI) {
  const options = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10
  };
  
  MongoClient.connect(MONGO_URI, options)
    .then(client => {
      console.log('✅ Connected to MongoDB Atlas');
      db = client.db('spaced-repetition');
    })
    .catch(error => {
      console.error('❌ MongoDB connection failed:', error.message);
      console.log('📱 App running in LOCAL MODE (cloud sync disabled)');
      console.log('🔧 To fix: Check MongoDB Atlas IP whitelist and credentials');
    });
} else {
  console.error('MONGO_URI environment variable not found');
}


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

// Cloud Sync Endpoints with MongoDB
app.post('/api/sync-to-cloud', async (req, res) => {
  try {
    const { email, subjects, contact, timestamp } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!subjects || !Array.isArray(subjects)) {
      return res.status(400).json({ error: 'Valid subjects array is required' });
    }

    if (!db) {
      return res.status(503).json({ 
        error: 'Cloud sync temporarily unavailable',
        message: 'MongoDB connection not available. App is running in local mode.',
        localMode: true
      });
    }

    const userData = {
      email: email.toLowerCase(),
      subjects,
      contact: contact || {},
      timestamp: timestamp || new Date().toISOString(),
      lastSync: new Date().toISOString()
    };

    // Upsert user data (update if exists, insert if not)
    await db.collection('userdata').replaceOne(
      { email: email.toLowerCase() },
      userData,
      { upsert: true }
    );

    console.log(`✅ Synced ${subjects.length} subjects to cloud for ${email}`);
    
    res.status(200).json({ 
      message: 'Successfully synced to cloud',
      subjectCount: subjects.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Sync to cloud error:', error);
    res.status(500).json({ error: 'Failed to sync to cloud: ' + error.message });
  }
});

app.get('/api/load-from-cloud', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!db) {
      return res.status(503).json({ 
        error: 'Cloud sync temporarily unavailable',
        message: 'MongoDB connection not available. App is running in local mode.',
        localMode: true
      });
    }

    const userData = await db.collection('userdata').findOne({ 
      email: email.toLowerCase() 
    });

    if (userData) {
      console.log(`✅ Loaded ${userData.subjects?.length || 0} subjects from cloud for ${email}`);
      res.status(200).json({
        subjects: userData.subjects || [],
        contact: userData.contact || {},
        timestamp: userData.timestamp,
        lastSync: userData.lastSync
      });
    } else {
      res.status(200).json({
        subjects: [],
        contact: {},
        message: 'No data found for this email'
      });
    }
  } catch (error) {
    console.error('❌ Load from cloud error:', error);
    res.status(500).json({ error: 'Failed to load from cloud: ' + error.message });
  }
});

// Serve static files from root (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
