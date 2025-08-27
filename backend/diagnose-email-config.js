#!/usr/bin/env node

/**
 * Email Configuration Diagnostic Script
 * 
 * This script diagnoses the current email configuration and tests email sending
 * in the production environment.
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

async function diagnoseEmailConfig() {
  console.log('🔧 EMAIL CONFIGURATION DIAGNOSTIC');
  console.log('==================================');
  
  // Check environment variables
  console.log('\n📧 Environment Variables:');
  console.log('EMAIL_SERVICE_ENABLED:', process.env.EMAIL_SERVICE_ENABLED || 'NOT SET');
  console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET');
  console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '***SET***' : 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
  console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
  
  // Check if email service should be enabled
  const emailEnabled = process.env.EMAIL_SERVICE_ENABLED === 'true';
  console.log('\n🚀 Email Service Status:');
  console.log('Service Enabled:', emailEnabled);
  
  if (!emailEnabled) {
    console.log('⚠️  EMAIL SERVICE IS DISABLED');
    console.log('   To enable: Set EMAIL_SERVICE_ENABLED=true in environment');
    return;
  }
  
  // Check required configurations
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  
  if (!emailUser || !emailPassword) {
    console.log('❌ MISSING REQUIRED EMAIL CONFIGURATION');
    console.log('   EMAIL_USER:', emailUser ? '✅ Set' : '❌ Missing');
    console.log('   EMAIL_PASSWORD:', emailPassword ? '✅ Set' : '❌ Missing');
    return;
  }
  
  console.log('✅ All required email environment variables are configured');
  
  // Test email connection
  console.log('\n🧪 Testing Email Connection...');
  
  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });
    
    // Verify SMTP connection
    console.log('Verifying SMTP connection...');
    const isVerified = await transporter.verify();
    
    if (isVerified) {
      console.log('✅ SMTP Connection verified successfully');
      
      // Send test email if recipient provided
      const testRecipient = process.argv[2];
      if (testRecipient) {
        console.log(`\n📬 Sending test email to: ${testRecipient}`);
        
        const testMailOptions = {
          from: process.env.EMAIL_FROM || emailUser,
          to: testRecipient,
          subject: 'EscaShop Email Service Test',
          html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
              <h2>🧪 Email Service Test</h2>
              <p>This is a test email from the EscaShop email service.</p>
              <p><strong>Configuration:</strong></p>
              <ul>
                <li>Service: Gmail SMTP</li>
                <li>From: ${process.env.EMAIL_FROM || emailUser}</li>
                <li>Environment: ${process.env.NODE_ENV}</li>
                <li>Timestamp: ${new Date().toISOString()}</li>
              </ul>
              <p>If you receive this email, the email service is working correctly! ✅</p>
            </div>
          `
        };
        
        await transporter.sendMail(testMailOptions);
        console.log('✅ Test email sent successfully!');
        
      } else {
        console.log('💡 To send a test email, run: node diagnose-email-config.js your-email@example.com');
      }
      
    } else {
      console.log('❌ SMTP Connection failed');
    }
    
  } catch (error) {
    console.log('❌ EMAIL CONNECTION FAILED');
    console.error('Error details:', error.message);
    
    if (error.message.includes('Invalid login')) {
      console.log('\n🔑 GMAIL AUTHENTICATION ISSUE:');
      console.log('   This usually means you need to:');
      console.log('   1. Enable 2-Factor Authentication on your Gmail account');
      console.log('   2. Generate an App Password for EscaShop');
      console.log('   3. Use the App Password instead of your regular password');
      console.log('   4. Set EMAIL_PASSWORD to the App Password in Render environment');
    }
  }
}

// Run diagnostic
diagnoseEmailConfig()
  .then(() => {
    console.log('\n✅ Email diagnostic completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
