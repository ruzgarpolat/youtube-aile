const webpush = require('web-push');
const cron = require('node-cron');
const { db, getAllSettings, getCurrentPeriod } = require('./db');

function configureWebPush() {
  const { vapid_public_key, vapid_private_key } = getAllSettings();
  const contact = process.env.VAPID_CONTACT || 'mailto:admin@youtube-aile.local';
  webpush.setVapidDetails(contact, vapid_public_key, vapid_private_key);
}

/**
 * Send push notifications to all unpaid members (or a specific memberId if provided).
 */
async function sendPaymentReminders({ memberId = null, force = false } = {}) {
  configureWebPush();
  const settings = getAllSettings();
  const period = getCurrentPeriod();

  let members;
  if (memberId) {
    members = db.prepare('SELECT * FROM members WHERE id = ?').all(memberId);
  } else {
    members = db.prepare('SELECT * FROM members').all();
  }

  let sentCount = 0;
  let failedCount = 0;
  const skipped = [];

  for (const member of members) {
    const payment = db
      .prepare('SELECT status FROM payments WHERE member_id = ? AND period = ?')
      .get(member.id, period);

    if (!force && payment && (payment.status === 'approved' || payment.status === 'pending')) {
      skipped.push(member.name);
      continue;
    }

    const subs = db
      .prepare('SELECT id, endpoint, subscription_json FROM push_subscriptions WHERE member_id = ?')
      .all(member.id);

    if (subs.length === 0) {
      continue;
    }

    const payload = JSON.stringify({
      title: 'YouTube Aile Ödeme Hatırlatması',
      body: `Merhaba ${member.name}, yarın ödeme günü! ${settings.amount_per_person} TL ödemeni yapıp dekontunu yükleyebilirsin.`,
      url: `/m/${member.token}`,
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription_json), payload);
        sentCount++;
      } catch (err) {
        failedCount++;
        // Remove expired or unsubscribed endpoints
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }
  }

  return { sentCount, failedCount, skipped, period };
}

function startScheduler() {
  // Runs every day at 10:00 AM server time
  cron.schedule('0 10 * * *', async () => {
    try {
      const settings = getAllSettings();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (tomorrow.getDate() === settings.payment_day) {
        const result = await sendPaymentReminders();
        console.log('[Scheduler] 1-day-before reminders sent:', result);
      }
    } catch (err) {
      console.error('[Scheduler] Error sending reminders:', err);
    }
  });
}

module.exports = {
  configureWebPush,
  sendPaymentReminders,
  startScheduler,
};
