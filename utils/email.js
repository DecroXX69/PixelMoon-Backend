const nodemailer = require('nodemailer');

// Create transporter with environment variables
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  };

  // Add auth if credentials are provided
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    config.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    };
  }

  return nodemailer.createTransporter(config);
};

/**
 * Send email using Nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content (optional)
 * @returns {Promise} - Promise resolving to email info
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    };

    // Add HTML content if provided
    if (html) {
      mailOptions.html = html;
    }

    console.log(`[Email Service] Sending email to: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Email sent successfully: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('[Email Service] Failed to send email:', error);
    throw new Error(`Email sending failed: ${error.message}`);
  }
};

/**
 * Send voucher code email to user
 * @param {Object} options - Voucher email options
 * @param {string} options.to - User email
 * @param {string} options.username - User name
 * @param {string} options.code - Voucher code
 * @param {string} options.type - Voucher type (smileone/moo)
 * @param {number} options.denomination - Voucher denomination
 * @param {number} options.price - Price paid
 */
const sendVoucherEmail = async ({ to, username, code, type, denomination, price }) => {
  const voucherTypeName = type === 'smileone' ? 'Smile.one' : 'MOO Gold';
  const denominationText = type === 'smileone' ? `${denomination.toLocaleString()} Smilecoins` : `${denomination} MOO points`;
  
  const subject = `Your ${voucherTypeName} Voucher Code from PixelMoon`;
  
  const text = `Hello ${username},

Thank you for your purchase from PixelMoon!

Here are your voucher details:
- Voucher Code: ${code}
- Type: ${voucherTypeName}
- Denomination: ${denominationText}
- Amount Paid: $${price.toFixed(2)}

Please keep this code safe and follow the redemption instructions for ${voucherTypeName}.

Thank you for choosing PixelMoon!

Best regards,
The PixelMoon Team`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .voucher-code { background-color: #1f2937; color: #f9fafb; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0; letter-spacing: 2px; }
        .details { background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 14px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎮 PixelMoon Voucher</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${username}</strong>,</p>
          <p>Thank you for your purchase from PixelMoon! Your ${voucherTypeName} voucher is ready.</p>
          
          <div class="voucher-code">
            ${code}
          </div>
          
          <div class="details">
            <h3>Voucher Details:</h3>
            <ul>
              <li><strong>Type:</strong> ${voucherTypeName}</li>
              <li><strong>Denomination:</strong> ${denominationText}</li>
              <li><strong>Amount Paid:</strong> $${price.toFixed(2)}</li>
            </ul>
          </div>
          
          <p><strong>Important:</strong> Please keep this code safe and follow the redemption instructions for ${voucherTypeName}.</p>
          
          <div class="footer">
            <p>Thank you for choosing PixelMoon!<br>
            <strong>The PixelMoon Team</strong></p>
          </div>
        </div>
      </div>
    </body>
    </html>`;

  return await sendEmail({ to, subject, text, html });
};

/**
 * Test email configuration
 */
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('[Email Service] SMTP configuration is valid');
    return true;
  } catch (error) {
    console.error('[Email Service] SMTP configuration error:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendVoucherEmail,
  testEmailConfig
};