// services/phonepeService.js - V2 Standard Checkout Implementation
const axios = require('axios');
const crypto = require('crypto');

let accessToken = null;
let tokenExpiry = null;

// Get OAuth token
async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await axios.post(
      `${process.env.PHONEPE_BASE_URL}/v1/oauth/token`,
      new URLSearchParams({
        client_id: process.env.PHONEPE_CLIENT_ID,
        client_version: process.env.PHONEPE_CLIENT_VERSION,
        client_secret: process.env.PHONEPE_CLIENT_SECRET,
        grant_type: 'client_credentials'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    accessToken = response.data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
    return accessToken;
  } catch (error) {
    console.error('Error getting PhonePe access token:', error.response?.data || error.message);
    throw new Error('Failed to get PhonePe access token');
  }
}

// Generate merchant order ID
function generateMerchantOrderId() {
  return 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Initiate payment
async function initiatePayment(amountPaise, transactionId) {
  try {
    const token = await getAccessToken();
    const merchantOrderId = generateMerchantOrderId();
    
    const paymentData = {
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200, // 20 minutes
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Wallet recharge payment",
        merchantUrls: {
          redirectUrl: `${process.env.PHONEPE_REDIRECT_URL}?transactionId=${transactionId}&merchantOrderId=${merchantOrderId}`
        }
      }
    };

    const response = await axios.post(
      `${process.env.PHONEPE_BASE_URL}/checkout/v2/pay`,
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return {
      merchantOrderId,
      checkoutUrl: response.data.url
    };
  } catch (error) {
    console.error('Error initiating payment:', error.response?.data || error.message);
    throw new Error('Failed to initiate payment');
  }
}

// Validate webhook callback
function validateCallback(authHeader, bodyString) {
  try {
    // Extract credentials from auth header
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new Error('Invalid authorization header');
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    if (username !== process.env.PHONEPE_CALLBACK_USERNAME || 
        password !== process.env.PHONEPE_CALLBACK_PASSWORD) {
      throw new Error('Invalid webhook credentials');
    }

    const payload = JSON.parse(bodyString);
    return { payload };
  } catch (error) {
    console.error('Webhook validation error:', error.message);
    throw new Error('Invalid webhook signature or payload');
  }
}

// Get payment status
async function getPaymentStatus(merchantOrderId) {
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(
      `${process.env.PHONEPE_BASE_URL}/checkout/v2/order/${merchantOrderId}/status`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error getting payment status:', error.response?.data || error.message);
    throw new Error('Failed to get payment status');
  }
}

// Initiate refund
async function initiateRefund(originalMerchantOrderId, refundAmountPaise) {
  try {
    const token = await getAccessToken();
    const merchantRefundId = 'REF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const refundData = {
      merchantRefundId,
      originalMerchantOrderId,
      amount: refundAmountPaise
    };

    const response = await axios.post(
      `${process.env.PHONEPE_BASE_URL}/payments/v2/refund`,
      refundData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return { 
      merchantRefundId,
      resp: response.data 
    };
  } catch (error) {
    console.error('Error initiating refund:', error.response?.data || error.message);
    throw new Error('Failed to initiate refund');
  }
}

// Get refund status
async function getRefundStatus(merchantRefundId) {
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(
      `${process.env.PHONEPE_BASE_URL}/payments/v2/refund/${merchantRefundId}/status`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error getting refund status:', error.response?.data || error.message);
    throw new Error('Failed to get refund status');
  }
}

module.exports = {
  initiatePayment,
  validateCallback,
  getPaymentStatus,
  initiateRefund,
  getRefundStatus
};