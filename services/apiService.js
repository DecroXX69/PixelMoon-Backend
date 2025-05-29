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
              headers: {
                'X-API-KEY': this.apiKeys.yokcash,
                'Content-Type': 'application/json'
              },
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
              headers: {
                'apikey': this.apiKeys.hopestore,
                'Content-Type': 'application/json'
              },
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
      const response = await axios.get(`${this.baseUrls.yokcash}/products`, {
        headers: {
          'X-API-KEY': this.apiKeys.yokcash,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Yokcash API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Yokcash products');
    }
  }

  async validateYokcashUser(gameId, userId, serverId = null) {
    try {
      const payload = {
        game_id: gameId,
        user_id: userId
      };
      
      if (serverId) {
        payload.server_id = serverId;
      }

      const response = await axios.post(`${this.baseUrls.yokcash}/validate`, payload, {
        headers: {
          'X-API-KEY': this.apiKeys.yokcash,
          'Content-Type': 'application/json'
        },
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
      const response = await axios.post(`${this.baseUrls.yokcash}/order`, orderData, {
        headers: {
          'X-API-KEY': this.apiKeys.yokcash,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Yokcash Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
    }
  }

  // Hopestore API Integration
  async getHopestoreProducts() {
    try {
      const response = await axios.get(`${this.baseUrls.hopestore}/products`, {
        headers: {
          'apikey': this.apiKeys.hopestore,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Hopestore API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Hopestore products');
    }
  }

  async validateHopestoreUser(gameId, userId, serverId = null) {
    try {
      const payload = {
        game_id: gameId,
        user_id: userId
      };
      
      if (serverId) {
        payload.server_id = serverId;
      }

      const response = await axios.post(`${this.baseUrls.hopestore}/validate`, payload, {
        headers: {
          'apikey': this.apiKeys.hopestore,
          'Content-Type': 'application/json'
        },
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
      const response = await axios.post(`${this.baseUrls.hopestore}/order`, orderData, {
        headers: {
          'apikey': this.apiKeys.hopestore,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Hopestore Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
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




}

module.exports = new APIService();