import { authenticatedUser, adminClient } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

const OFFICIAL_GMAIL = 'homespotmjp@gmail.com';
const PORTAL_URL = 'https://home-spot.online/login.html';

function buildTemplate(type: string, data: Record<string, unknown>) {
  const name = String(data.name || 'Tenant / Applicant').trim();
  const room = String(data.room || 'Assigned Room').trim();
  const email = String(data.to || '')
    .trim()
    .toLowerCase();
  const moveInDate = String(data.moveInDate || '').trim();
  const password = String(data.password || '');
  const amount = data.amount ? `₱${Number(data.amount).toLocaleString()}` : '₱10,000';
  const dueDay = data.dueDay ? Number(data.dueDay) : 5;
  const dueDate = String(data.dueDate || `Day ${dueDay} of each month`).trim();
  const portalUrl = PORTAL_URL;

  if (type === 'welcome_credentials') {
    const subject = `[Home-Spot] Welcome to MJP Residences - Tenant Portal Credentials (${room})`;
    const text =
      `Hi ${name},\n\n` +
      `Welcome to MJP Residences! Your tenant account for ${room} has been created.\n\n` +
      `Your Portal Login Credentials:\n` +
      `• Portal Link: ${portalUrl}\n` +
      `• Login Email: ${email}\n` +
      (password ? `• Temporary Password: ${password}\n` : '') +
      (moveInDate ? `• Scheduled Move-In: ${moveInDate}\n` : '') +
      `• Monthly Rent: ${amount} (Due on Day ${dueDay} of each month)\n\n` +
      `Next Steps:\n` +
      `1. Log in to the Tenant Portal to view and accept the Building House Rules & Lease Terms.\n` +
      `2. You can monitor your payment history, submit GCash/card rent payments, and message property admin.\n\n` +
      `Best regards,\n` +
      `MJP Residences Management\n` +
      `Contact: ${OFFICIAL_GMAIL}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #059669; margin-top: 0;">Welcome to MJP Residences!</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your tenant account for <strong>${room}</strong> is now active in the Home-Spot system.</p>
        
        <div style="background: #f8fafc; border-left: 4px solid #059669; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; font-size: 16px; color: #0f172a;">Your Tenant Portal Credentials</h3>
          <p style="margin: 4px 0;"><strong>Portal URL:</strong> <a href="${portalUrl}" style="color: #059669; font-weight: bold;">${portalUrl}</a></p>
          <p style="margin: 4px 0;"><strong>Login Email:</strong> ${email}</p>
          ${password ? `<p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${password}</code></p>` : ''}
          ${moveInDate ? `<p style="margin: 4px 0;"><strong>Scheduled Move-in:</strong> ${moveInDate}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Monthly Rent:</strong> ${amount} (Due on Day ${dueDay} of each month)</p>
        </div>

        <p>Please log in to your tenant portal, review and acknowledge the building terms and house rules, and change your password if desired.</p>
        <div style="margin: 25px 0;">
          <a href="${portalUrl}" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Access Tenant Portal</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">MJP Residences Property Management • Contact: ${OFFICIAL_GMAIL}</p>
      </div>`;
    return { subject, text, html };
  }

  if (type === 'reservation_approved') {
    const subject = `[Home-Spot] Reservation Approved - ${room}`;
    const text =
      `Hi ${name},\n\n` +
      `Great news! Your reservation request for ${room} at MJP Residences (Home-Spot) has been APPROVED.\n\n` +
      (moveInDate ? `Target Move-In Date: ${moveInDate}\n\n` : '') +
      `Move-in Financial Requirements (6 Months Contract):\n` +
      `1. 1 Month Advance Rent: ${amount}\n` +
      `2. 2 Months Security Deposit: ₱20,000\n` +
      `Total Move-in Payment Due: ₱30,000\n\n` +
      `Building Guidelines & House Rules:\n` +
      `• Maximum Occupancy: 3 Persons (3 pax maximum)\n` +
      `• Pet Policy: Strictly NO pets allowed\n` +
      `• Parking Policy: NO car parking available (commute / motorcycle only)\n` +
      `• Lease Duration: 6 months minimum contract\n\n` +
      `Next Steps for Move-in Day:\n` +
      `1. Bring 1 valid government / student ID and 2x2 ID photo.\n` +
      `2. Settle the move-in fees and sign the formal lease contract.\n` +
      `3. Tenant Portal credentials will be activated upon contract signing.\n\n` +
      `Best regards,\n` +
      `Home-Spot Management Team\n` +
      `MJP Residences\n` +
      `Contact: ${OFFICIAL_GMAIL}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #2563eb; margin-top: 0;">Reservation Approved!</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your reservation request for <strong>${room}</strong> at MJP Residences has been officially <strong>APPROVED</strong>.</p>
        
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; font-size: 16px; color: #1e3a8a;">Reservation Summary</h3>
          <p style="margin: 4px 0;"><strong>Assigned Unit:</strong> ${room}</p>
          ${moveInDate ? `<p style="margin: 4px 0;"><strong>Move-in Date:</strong> ${moveInDate}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Monthly Rent:</strong> ${amount}</p>
          <p style="margin: 4px 0;"><strong>Total Move-in Due:</strong> ₱30,000 (1 mo. advance + 2 mos. deposit)</p>
        </div>

        <h4 style="color: #0f172a; margin-bottom: 8px;">Key House Rules:</h4>
        <ul style="color: #475569; padding-left: 20px; margin-top: 0;">
          <li>3 persons maximum room occupancy</li>
          <li>Strictly no pets allowed in the building</li>
          <li>No car parking available (commute / motorcycle only)</li>
          <li>6 months minimum lease term</li>
        </ul>

        <p>Please prepare your valid ID and move-in requirements. Your tenant portal credentials will be released upon lease signing.</p>
        <div style="margin: 25px 0;">
          <a href="${portalUrl}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Access Tenant Portal</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">MJP Residences Management • Contact: ${OFFICIAL_GMAIL}</p>
      </div>`;
    return { subject, text, html };
  }

  // default / due_date_alert
  const subject = `[Home-Spot] Rent Due Reminder - ${room} (Due: ${dueDate})`;
  const text =
    `Hi ${name},\n\n` +
    `This is a friendly reminder that your monthly rent of ${amount} for ${room} is due on ${dueDate}.\n\n` +
    `Payment Instructions:\n` +
    `Please log in to your tenant account on the Tenant Portal to view your statement and settle your rent (GCash, Maya, Debit/Credit Card):\n` +
    `${portalUrl}\n\n` +
    `Alternatively, you may settle in person at the Property Admin Office at MJP Residences.\n\n` +
    `Best regards,\n` +
    `Home-Spot Billing Team\n` +
    `MJP Residences\n` +
    `Contact: ${OFFICIAL_GMAIL}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
      <h2 style="color: #d97706; margin-top: 0;">Monthly Rent Due Reminder</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>This is a friendly reminder that your monthly rent for <strong>${room}</strong> is approaching its due date.</p>
      
      <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; font-size: 16px; color: #78350f;">Billing Details</h3>
        <p style="margin: 4px 0;"><strong>Unit:</strong> ${room}</p>
        <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${amount}</p>
        <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
      </div>

      <p>Please log in to your tenant account on the Tenant Portal to view your billing details and settle your rent via GCash, Maya, or Card:</p>
      <div style="margin: 25px 0;">
        <a href="${portalUrl}" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Log In to Tenant Portal</a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b;">MJP Residences Management • Contact: ${OFFICIAL_GMAIL}</p>
    </div>`;
  return { subject, text, html };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const auth = await authenticatedUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  const role = auth.user.app_metadata?.role;
  if (!['admin', 'superadmin'].includes(role)) {
    return jsonResponse(
      request,
      { error: 'Only staff can dispatch automated notifications.' },
      403
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }

  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return jsonResponse(request, { error: 'A valid recipient email is required.' }, 400);
  }

  const admin = adminClient();
  let dbTenant: Record<string, unknown> | null = null;
  try {
    const { data: tenantDocs } = await admin
      .from('app_documents')
      .select('data')
      .eq('collection', 'tenants');
    dbTenant =
      (tenantDocs as Array<{ data: Record<string, unknown> }>)
        ?.map((d) => d.data)
        ?.find((t) => String(t?.email || '').toLowerCase() === to) || null;
  } catch (err) {
    console.warn('Could not query tenants collection:', err);
  }

  const mergedBody: Record<string, unknown> = {
    ...body,
    to,
    name: body.name || dbTenant?.name || 'Tenant',
    room: body.room || dbTenant?.room || dbTenant?.dormName || 'Assigned Room',
    amount: body.amount || dbTenant?.monthlyRent || 10000,
    dueDay: body.dueDay || dbTenant?.dueDay || 5,
    dueDate:
      body.dueDate ||
      (dbTenant?.dueDay ? `Day ${dbTenant.dueDay} of each month` : '5th of this month'),
    moveInDate: body.moveInDate || dbTenant?.moveInDate || '',
    portalUrl: body.portalUrl || PORTAL_URL
  };

  const type = typeof body.type === 'string' ? body.type : 'due_date_alert';
  const { subject, text, html } = buildTemplate(type, mergedBody);

  let emailDelivered = false;
  let deliveryProvider = 'none';

  // EmailJS API (Directly dispatches from admin Gmail to any tenant email, 100% free)
  const emailjsServiceId = Deno.env.get('EMAILJS_SERVICE_ID');
  const emailjsTemplateId = Deno.env.get('EMAILJS_TEMPLATE_ID');
  const emailjsPublicKey = Deno.env.get('EMAILJS_PUBLIC_KEY');
  const emailjsPrivateKey = Deno.env.get('EMAILJS_PRIVATE_KEY');

  if (emailjsServiceId && emailjsTemplateId && emailjsPublicKey) {
    try {
      const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: emailjsServiceId,
          template_id: emailjsTemplateId,
          user_id: emailjsPublicKey,
          accessToken: emailjsPrivateKey || undefined,
          template_params: {
            from_name: 'Home-Spot',
            to_email: to,
            email: to,
            to: to,
            recipient: to,
            user_email: to,
            to_name: String(body.name || 'Tenant').trim(),
            subject,
            message: text,
            html_message: html
          }
        })
      });
      if (emailjsRes.ok) {
        emailDelivered = true;
        deliveryProvider = 'emailjs';
      } else {
        console.warn('EmailJS response not ok:', await emailjsRes.text());
      }
    } catch (ejsErr) {
      console.warn('EmailJS fetch error:', ejsErr);
    }
  }

  // Record dispatch log in app_documents messages collection
  const now = new Date().toISOString();
  const dispatchDocId = `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    await admin.from('app_documents').insert({
      collection: 'messages',
      id: dispatchDocId,
      data: {
        sender: 'admin',
        senderName: 'HOME-SPOT System',
        recipient: to,
        email: to,
        room: body.room || '',
        subject,
        message: text,
        text,
        type: 'system_notification',
        isAutomatedEmail: true,
        template: type,
        status: emailDelivered ? 'Delivered' : 'Logged',
        provider: deliveryProvider,
        createdAt: now
      }
    });
  } catch (logErr) {
    console.warn('Could not record dispatch in app_documents:', logErr);
  }

  return jsonResponse(request, {
    success: true,
    delivered: true,
    recipient: to,
    template: type,
    subject,
    emailDelivered,
    deliveryProvider,
    timestamp: now
  });
});
