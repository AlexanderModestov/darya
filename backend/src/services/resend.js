import { Resend } from 'resend';

export async function sendEmail({ to, subject, text, from, apiKey }) {
  const key = apiKey || process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const client = new Resend(key);

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
