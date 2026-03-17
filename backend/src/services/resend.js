import { Resend } from 'resend';

let resend = null;

function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendEmail({ to, subject, text, from }) {
  const client = getResend();
  if (!client) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const result = await client.emails.send({
    from: from || process.env.EMAIL_FROM,
    to: [to],
    subject,
    text
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend error');
  }

  return result.data;
}
