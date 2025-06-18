// services/apiService.js - Fixed version
const axios = require('axios');
const crypto = require('crypto');
const FormData   = require('form-data');

const FALLBACK_PRODUCTS = [
  "mobilelegends","bigo","hago","ragnarokm","freefirediamantes",
  "loveanddeepspace","watcherofrealms","sweetdance","supersus",
  "pubgmobile","tinder","hok","honkai"
];
class APIService {
  constructor() {
    this.apiKeys = { 
      smileone: process.env.SMILEONE_SECRET,
      yokcash: process.env.YOKCASH_API_KEY,
      hopestore: process.env.HOPESTORE_API_KEY
    };

    this.baseUrls = {
      smileone: process.env.SMILEONE_BASE_URL || 'https://www.smile.one/br/smilecoin/api',
      yokcash: 'https://a-api.yokcash.com/api',
      hopestore: 'https://a-api.hopestore.id/api'
    };

    // Fix: Add smileone credentials object
    this.smileone = {
      uid: process.env.SMILEONE_UID,
      email: process.env.SMILEONE_EMAIL,
      secret: process.env.SMILEONE_SECRET
    };
  }

_buildSign(params, secret) {
  // Grab the values in the right order
  const { uid, email, product, time } = params;
  // Concatenate them with nothing in between
  const raw = `${uid}${email}${product}${time}${secret}`;
  console.log('Signing string:', raw);
  // One MD5 round, hex lowercase
  return crypto.createHash('md5').update(raw).digest('hex');
}


  // Smile.one API Integration
  async getSmileoneGames() {
    const url = `${this.baseUrls.smileone}/product`;
    const { uid, email, secret } = this.smileone;
    const time = Math.floor(Date.now()/1000);
    const params = { uid, email, product: '', time };
    const sign   = this._buildSign(params, secret);
    const body   = new URLSearchParams({ ...params, sign }).toString();

    try {
      const resp = await axios.post(url, body, {
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        timeout: 10_000
      });

      // If they return a non-empty array, use it
      if (Array.isArray(resp.data) && resp.data.length > 0) {
        return resp.data;
      }

      // Otherwise fall back to our static list
      return FALLBACK_PRODUCTS.map(name => ({ name }));

    } catch (err) {
      console.error('Smile.one fetch error:', err.response?.data || err.message);
      // on any error, also fall back
      return FALLBACK_PRODUCTS.map(name => ({ name }));
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

 

  /** Validate a user via Smile.one getrole */
  async validateSmileoneUser({ product, productid, userid, zoneid }) {
  try {
    const url = `${this.baseUrls.smileone}/getrole`;
    const { uid, email, secret } = this.smileone;
    const time = Math.floor(Date.now()/1000);
    const params = { uid, email, product, productid, userid, zoneid, time };
    const sign = this._buildSign(params, secret);
    const body = new URLSearchParams({ ...params, sign });
    
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    
    return response.data;
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
      const body = new URLSearchParams({ ...params, sign });
      
     const form = new FormData();
Object.entries({ ...params, sign }).forEach(([key, value]) => {
  form.append(key, value);
});

const { data } = await axios.post(url, form, {
  headers: form.getHeaders(), // Automatically sets multipart/form-data
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
      // POST to https://a-api.yokcash.com/api/service (URL‐encoded)
      const url = `${this.baseUrls.yokcash}/service`;
      const body = new URLSearchParams({ api_key: this.apiKeys.yokcash });
      const response = await axios.post(
        url,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );

      // response.data should be something like { status: true, data: [ … ] }
      if (!response.data || typeof response.data !== 'object') {
        console.error('Yokcash returned unexpected payload:', response.data);
        throw new Error('Yokcash did not return JSON');
      }
      return response.data; 
    } catch (error) {
      console.error('Yokcash API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Yokcash products');
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
      // POST to https://a-api.yokcash.com/api/status
      const url = `${this.baseUrls.yokcash}/status`;
      const body = new URLSearchParams({
        api_key:  this.apiKeys.yokcash,
        order_id: orderId
      });
      const response = await axios.post(
        url,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      console.error('Yokcash getOrderStatus Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Yokcash order status');
    }
  }

  // Hopestore API Integration
async getHopestoreProducts() {
  try {
    // POST to https://a-api.hopestore.id/api/service
    const url = `${this.baseUrls.hopestore}/service`;
    const body = new URLSearchParams({ api_key: this.apiKeys.hopestore });
    const response = await axios.post(
      url,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    // response.data should look like { status: true, msg: "...", data: [ … ] }
    if (!response.data || typeof response.data !== 'object') {
      console.error('Hopestore returned unexpected payload:', response.data);
      throw new Error('Hopestore did not return JSON');
    }
    return response.data;
  } catch (error) {
    console.error('Hopestore API Error:', error.response?.data || error.message);
    throw new Error('Failed to fetch Hopestore products');
  }
}



   async processHopestoreOrder(orderData) {
    try {
      // Hopestore /order expects URL-encoded form:
      const url = `${this.baseUrls.hopestore}/order`;
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
      const url = `${this.baseUrls.hopestore}/status`;
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
    try {
      // POST to https://a-api.yokcash.com/api/saldo
      const url = `${this.baseUrls.yokcash}/saldo`;
      const body = new URLSearchParams({ api_key: this.apiKeys.yokcash });
      const res = await axios.post(
        url,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
      return res.data; // { status: true/false, msg: "...", data: <balance> }
    } catch (error) {
      console.error('Yokcash getBalance Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Yokcash balance');
    }
  }


// Hopestore balance (assuming similar)
async getHopestoreBalance() {
  // Use the “a-api.hopestore.id” host (per their docs) instead of “api.hopestore.id”
  const url = 'https://a-api.hopestore.id/api/saldo';
  const res = await axios.post(
    url,
    new URLSearchParams({ api_key: this.apiKeys.hopestore }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  // Their response is { status: true/false, msg: “…”, data: <balanceNumber> }
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