const express = require('express');
const router = express.Router();
const axios = require('axios');

// URLSearchParams for x-www-form-urlencoded bodies
const { URLSearchParams } = require('url');

// POST /api/test/hopestore/services
router.post('/hopestore/services', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('api_key', process.env.HOPESTORE_API_KEY);

    const response = await axios.post(
      'https://a-api.hopestore.id/api/service',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Hopestore test error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/test/yokcash/services
router.post('/yokcash/services', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('api_key', process.env.YOKCASH_API_KEY);

    const response = await axios.post(
      'https://a-api.yokcash.com/api/service',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Yokcash test error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Game Topup API is running',
    timestamp: new Date().toISOString()
  });
});

// Get server IP info
router.get('/get-my-ip', async (req, res) => {
  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const clientIP = req.connection.remoteAddress;
    const externalIP = await axios.get('https://api.ipify.org?format=json');
    
    res.json({
      forwardedFor,
      realIP,
      clientIP,
      externalIP: externalIP.data.ip,
      renderURL: req.get('host')
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Check IP from Hopestore
router.get('/hopestore/checkip', async (req, res) => {
  try {
    const response = await axios.get('https://a-api.hopestore.id/v3/checkip', {
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    console.error('Hopestore checkip error:', err.message);
    res.status(502).json({ error: 'Failed to fetch checkip', details: err.message });
  }
});

// Check IP from Yokcash
router.get('/yokcash/checkip', async (req, res) => {
  try {
    const response = await axios.get('https://a-api.yokcash.com/v3/checkip', {
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    console.error('Yokcash checkip error:', err.message);
    res.status(502).json({ error: 'Failed to fetch checkip', details: err.message });
  }
});

// Universal test route for proxying API calls
router.post('/test-api', async (req, res) => {
  const { url, method = 'GET', headers = {}, body = {} } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await axios({
      url,
      method,
      headers,
      data: body,
      timeout: 10000
    });

    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({
      error: 'Request failed',
      message: err.message,
      data: err.response?.data || null,
    });
  }
});

module.exports = router;
