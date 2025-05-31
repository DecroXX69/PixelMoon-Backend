// services/apiService.js - Fixed version
const axios = require('axios');
const crypto = require('crypto');

class APIService {
  constructor() {
    this.apiKeys = { 
      smileone: process.env.SMILEONE_SECRET,
      yokcash: process.env.YOKCASH_API_KEY,
      hopestore: process.env.HOPESTORE_API_KEY
    };

    this.baseUrls = {
      smileone: process.env.SMILEONE_BASE_URL || 'https://www.smile.one/br/smilecoin/api',
      yokcash: 'https://api.yokcash.com/v1',
      hopestore: 'https://api.hopestore.id/v1'
    };

    // Fix: Add smileone credentials object
    this.smileone = {
      uid: process.env.SMILEONE_UID,
      email: process.env.SMILEONE_EMAIL,
      secret: process.env.SMILEONE_SECRET
    };
  }


// ...existing code...

  // Universal verifyUserId for all providers
  async verifyUserId(provider, gameId, userId, serverId = null) {
    switch (provider) {
      case 'smile.one':
        return await this.validateSmileoneUser({
          product: gameId,
          productid: '',
          userid: userId,
          zoneid: serverId || ''
        });
      case 'yokcash':
        try {
          const payload = { game_id: gameId, user_id: userId };
          if (serverId) payload.server_id = serverId;
          const response = await axios.post(
            `${this.baseUrls.yokcash}/validate`,
            payload,
            {
             params: { api_key: this.apiKeys.yokcash },
              timeout: 10000
            }
          );
          return response.data;
        } catch (error) {
          console.error('Yokcash verifyUserId error:', error.response?.data || error.message);
          throw new Error('Failed to verify Yokcash user ID');
        }
      case 'hopestore':
        try {
          const payload = { game_id: gameId, user_id: userId };
          if (serverId) payload.server_id = serverId;
          const response = await axios.post(
            `${this.baseUrls.hopestore}/validate`,
            payload,
            {
              params: { api_key: this.apiKeys.hopestore },
              timeout: 10000
            }
          );
          return response.data;
        } catch (error) {
          console.error('Hopestore verifyUserId error:', error.response?.data || error.message);
          throw new Error('Failed to verify Hopestore user ID');
        }
      default:
        throw new Error('Invalid API provider');
    }
  }

// ...existing code...


  // Smile.one API Integration
  async getSmileoneGames() {
    try {
      const url = `${this.baseUrls.smileone}/product`;
      const { uid, email, secret } = this.smileone;
      const time = Math.floor(Date.now()/1000);
      const params = { uid, email, time, product: '' }; // product blank returns all titles
      const sign = this._buildSign(params, secret);
      const body = new URLSearchParams({ ...params, sign });
      
      const resp = await axios.post(url, body, { 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      return resp.data;  // array of { name: "mobilelegends", … }
    } catch (error) {
      console.error('Smile.one games fetch error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Smile.one games');
    }
  }

  async getSmileoneServers(product) {
    try {
      const url = `${this.baseUrls.smileone}/getserver`;
      const { uid, email, secret } = this.smileone;
      const time = Math.floor(Date.now()/1000);
      const params = { uid, email, product, time };
      const sign = this._buildSign(params, secret);
      const body = new URLSearchParams({ ...params, sign });
      
      const resp = await axios.post(url, body, { 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      return resp.data.server_list || []; // array of { server_id, server_name }
    } catch (error) {
      console.error('Smile.one servers fetch error:', error.response?.data || error.message);
      return []; // Return empty array instead of throwing
    }
  }

  async getSmileonePacks(product) {
    try {
      const url = `${this.baseUrls.smileone}/productlist`;
      const { uid, email, secret } = this.smileone;
      const time = Math.floor(Date.now()/1000);
      const params = { uid, email, product, time };
      const sign = this._buildSign(params, secret);
      const body = new URLSearchParams({ ...params, sign });
      
      const resp = await axios.post(url, body, { 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      return resp.data.data?.product || []; // array of { id, spu, price }
    } catch (error) {
      console.error('Smile.one packs fetch error:', error.response?.data || error.message);
      return []; // Return empty array instead of throwing
    }
  }

  _buildSign(params, secret) {
    const sorted = Object.keys(params).sort();
    let str = sorted.map(k => `${k}=${params[k]}`).join('&') + `&${secret}`;
    const first = crypto.createHash('md5').update(str).digest('hex');
    return crypto.createHash('md5').update(first).digest('hex');
  }

  /** Validate a user via Smile.one getrole */
  async validateSmileoneUser({ product, productid, userid, zoneid }) {
    try {
      const url = `${this.baseUrls.smileone}/getrole`;
      const { uid, email, secret } = this.smileone;
      const time = Math.floor(Date.now()/1000);
      const params = { uid, email, product, productid, userid, zoneid, time };
      const sign = this._buildSign(params, secret);
      const body = new URLSearchParams({ ...params, sign });
      
      const ok = validationResult.status === 200;
res.status(ok ? 200 : 400).json({
  success: ok,
  valid:   ok,
  data:    validationResult
});

      
      const { data } = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      return data;
    } catch (error) {
      console.error('Smile.one user validation error:', error.response?.data || error.message);
      throw new Error('Failed to validate Smile.one user');
    }
  }

  /** Create an order via Smile.one createorder */
  async processSmileoneOrder({ product, productid, userid, zoneid, orderid }) {
    try {
      const url = `${this.baseUrls.smileone}/createorder`;
      const { uid, email, secret } = this.smileone;
      const time = Math.floor(Date.now()/1000);
      const params = { uid, email, product, productid, userid, zoneid, time };
      const sign = this._buildSign(params, secret);
      const body = new URLSearchParams({ ...params, sign, orderid });
      
      const { data } = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });
      
      return data;
    } catch (error) {
      console.error('Smile.one order processing error:', error.response?.data || error.message);
      throw new Error('Failed to process Smile.one order');
    }
  }

  // Yokcash API Integration
async getYokcashProducts() {
  try {
    // POST with URL-encoded api_key
    const url = 'https://a-api.yokcash.com/v1/products';
    const body = new URLSearchParams({ api_key: this.apiKeys.yokcash });
    const response = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    return response.data; // { status: true, data: [ ... ] }
  } catch (error) {
    console.error('Yokcash API Error:', error.response?.data || error.message);
    throw new Error('Failed to fetch Yokcash products');
  }
}


  async validateYokcashUser(gameId, userId, serverId = null) {
   try {
     // Per Yokcash docs, this must be URL-encoded form data:
     const url = `${this.baseUrls.yokcash}/validate`;
     const body = new URLSearchParams({
       api_key: this.apiKeys.yokcash,
       game_id: gameId,
       user_id: userId,
       ...(serverId && { server_id: serverId })
     });
     const response = await axios.post(url, body.toString(), {
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       timeout: 10000
     });
     return response.data;
   } catch (error) {
     console.error('Yokcash User Validation Error:', error.response?.data || error.message);
      throw new Error('Failed to validate user');
    }
  }

    async processYokcashOrder(orderData) {
    try {
      // orderData should contain { service_id, target, contact, idtrx }
      const url = `${this.baseUrls.yokcash}/order`;
      const body = new URLSearchParams({
        api_key:    this.apiKeys.yokcash,
        service_id: orderData.service_id,
        target:     orderData.target,
        contact:    orderData.contact,
        idtrx:      orderData.idtrx
      });
      const response = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Yokcash Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
    }
  }

  async getYokcashOrderStatus(orderId) {
    try {
      const url = 'https://a-api.yokcash.com/v1/status';
      // Per Yokcash docs: POST with URL‐encoded api_key & order_id
      const body = new URLSearchParams({
        api_key:  this.apiKeys.yokcash,
        order_id: orderId
      });
      const response = await axios.post(
        url,
        body.toString(),
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000 
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        'Yokcash getOrderStatus Error:',
        error.response?.data || error.message
      );
      throw new Error('Failed to fetch Yokcash order status');
    }
  }

  // Hopestore API Integration
 async getHopestoreProducts() {
  try {
    // Hopestore docs say: POST to /api/service with URL-encoded { api_key }
    const url = 'https://a-api.hopestore.id/api/service';
    const body = new URLSearchParams({ api_key: this.apiKeys.hopestore });
    const response = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    return response.data; // { status, msg, data: [ ...services ] }
  } catch (error) {
    console.error('Hopestore API Error:', error.response?.data || error.message);
    throw new Error('Failed to fetch Hopestore products');
  }
}


    async validateHopestoreUser(gameId, userId, serverId = null) {
    try {
      // Hopestore /validate expects URL-encoded form:
      const url = `${this.baseUrls.hopestore}/api/validate`;
      const body = new URLSearchParams({
        api_key:  this.apiKeys.hopestore,
        service_id: gameId,    // “service_id” or “game_id” depending on their docs
        target:     serverId 
                     ? `${userId}|${serverId}` 
                     : `${userId}`
      });
      const response = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Hopestore User Validation Error:', error.response?.data || error.message);
      throw new Error('Failed to validate user');
    }
  }
   async processHopestoreOrder(orderData) {
    try {
      // Hopestore /order expects URL-encoded form:
      const url = `${this.baseUrls.hopestore}/api/order`;
      // orderData should have keys: service_id, target, contact, idtrx
      const body = new URLSearchParams({
        api_key:    this.apiKeys.hopestore,
        service_id: orderData.service_id,
        target:     orderData.target,   // “userId|zoneId” or “userId”
        contact:    orderData.contact,  // phone number starting with country code
        idtrx:      orderData.idtrx     // unique invoice ID
      });
      const response = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Hopestore Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
    }
  }

   async getHopestoreOrderStatus(orderId) {
    try {
      const url = 'https://a-api.hopestore.id/api/status';
      // Hopestore expects the same pattern: POST with api_key & order_id
      const body = new URLSearchParams({
        api_key:  this.apiKeys.hopestore,
        order_id: orderId
      });
      const response = await axios.post(
        url,
        body.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        'Hopestore getOrderStatus Error:',
        error.response?.data || error.message
      );
      throw new Error('Failed to fetch Hopestore order status');
    }
  }


  // Universal methods that route to appropriate API
  async getProducts(provider, productSlug) {
    switch (provider) {
      case 'smile.one':
        return await this.getSmileonePacks(productSlug);
      case 'yokcash':
        return await this.getYokcashProducts();
      case 'hopestore':
        return await this.getHopestoreProducts();
      default:
        throw new Error('Invalid API provider');
    }
  }

  async validateUser(provider, gameId, userId, serverId = null) {
    switch (provider) {
      case 'smile.one':
        // Fix: Smile.one expects different parameter structure
        return await this.validateSmileoneUser({
          product: gameId,
          productid: '', // Pack ID if needed
          userid: userId,
          zoneid: serverId || ''
        });
      case 'yokcash':
        return await this.validateYokcashUser(gameId, userId, serverId);
      case 'hopestore':
        return await this.validateHopestoreUser(gameId, userId, serverId);
      default:
        throw new Error('Invalid API provider');
    }
  }

  async processOrder(provider, orderData) {
    switch (provider) {
      case 'smile.one':
        return await this.processSmileoneOrder(orderData);
      case 'yokcash':
        return await this.processYokcashOrder(orderData);
      case 'hopestore':
        return await this.processHopestoreOrder(orderData);
      default:
        throw new Error('Invalid API provider');
    }
  }

  // Test method for API connectivity
  async testConnection(provider) {
    try {
      switch (provider) {
        case 'smile.one':
          await this.getSmileoneGames();
          return { success: true, message: 'Smile.one connection successful' };
        case 'yokcash':
          await this.getYokcashProducts();
          return { success: true, message: 'Yokcash connection successful' };
        case 'hopestore':
          await this.getHopestoreProducts();
          return { success: true, message: 'Hopestore connection successful' };
        default:
          throw new Error('Invalid provider for testing');
      }
    } catch (error) {
      return { 
        success: false, 
        message: `${provider} connection failed: ${error.message}` 
      };
    }
  }

// Yokcash balance
async getYokcashBalance() {
  const res = await axios.get(`${this.baseUrls.yokcash}/saldo`, {
    params: { api_key: this.apiKeys.hopestore },
  });
  return res.data; // { status, msg, data }
}

// Hopestore balance (assuming similar)
async getHopestoreBalance() {
  const res = await axios.get(`${this.baseUrls.hopestore}/saldo`, {
    params: { api_key: this.apiKeys.hopestore },
  });
  return res.data;
}

// Smile.one points
async getSmileonePoints(product) {
  const url = `${this.baseUrls.smileone.replace('/smilecoin/api','')}/smilecoin/api/querypoints`;
  const { uid, email, secret } = this.smileone;
  const time = Math.floor(Date.now()/1000);
  const params = { uid, email, product, time };
  const sign = this._buildSign(params, secret);
  const { data } = await axios.post(url, new URLSearchParams({ ...params, sign }));
  return data; // { status, message, smile_points }
}



}

module.exports = new APIService();