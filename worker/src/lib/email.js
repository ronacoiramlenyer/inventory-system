// Sends the F-LAB-004 Equipment Work Request to the secretary by email,
// laid out the same way as the printed form, right when a request is filed.
export async function sendWorkRequestEmail(env, request) {
  if (!env.RESEND_API_KEY || !env.SECRETARY_EMAIL) {
    console.error('Skipping EWR email: RESEND_API_KEY or SECRETARY_EMAIL is not configured');
    return { sent: false, error: 'Email is not configured' };
  }

  const html = renderWorkRequestEmailHtml(request);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Falls back to Resend's sandbox sender, which can only deliver to the
        // Resend account's own address -- set EMAIL_FROM once a sending domain
        // is verified in Resend so it can actually reach the secretary.
        from: env.EMAIL_FROM || 'LSGH Lab Inventory <onboarding@resend.dev>',
        to: [env.SECRETARY_EMAIL],
        subject: `Equipment Work Request ${request.request_no} — ${request.equipment_name_description}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Resend API error ${res.status}: ${body}`);
      const hint =
        res.status === 403
          ? 'sending domain not verified in Resend yet — see resend.com/domains'
          : `Resend API error ${res.status}`;
      return { sent: false, error: hint };
    }
    return { sent: true };
  } catch (err) {
    console.error('Failed to send EWR email:', err);
    return { sent: false, error: 'Failed to reach email service' };
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

function row(label, value) {
  return `
    <tr>
      <td style="border:1px solid #cbd5e1;background:#f8fafc;padding:8px 12px;font-weight:600;width:220px;">${escapeHtml(label)}</td>
      <td style="border:1px solid #cbd5e1;padding:8px 12px;">${escapeHtml(value) || '&nbsp;'}</td>
    </tr>`;
}

function renderWorkRequestEmailHtml(request) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:640px;margin:0 auto;">
    <h2 style="text-align:center;">Equipment Work Request (EWR) Form</h2>
    <p style="text-align:center;color:#64748b;">Date: ${escapeHtml(request.date_requested)} &nbsp;•&nbsp; Request No.: ${escapeHtml(request.request_no)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      ${row('Equipment Name & Description:', request.equipment_name_description)}
      ${row('Equipment ID/Serial Number:', request.serial_number)}
      ${row('Department:', request.department_name)}
      ${row('Location:', request.laboratory_name)}
      ${row('Date Needed:', request.date_needed)}
      ${row('Nature of Request:', request.nature_of_request)}
      ${row('Detailed Description of Request:', request.detailed_description)}
      ${row('Requested by:', request.requested_by)}
    </table>
    <p style="margin-top:16px;color:#64748b;font-size:13px;">
      This request has been filed and is awaiting approval from the Subject Coordinator.
    </p>
  </div>`;
}
