// services/apiService.js
const axios = require('axios');

class APIService {
  constructor() {
    this.apiKeys = {
      smileone: '8a03fb3afc7cb8342fcf954a44b2f0c8',
      yokcash: 'APIH3MEDX1746109623999',
      hopestore: 'API9BX6XW1747642730999'
    };

    this.baseUrls = {
      smileone: 'https://api.smile.one/v1',
      yokcash: 'https://api.yokcash.com/v1',
      hopestore: 'https://api.hopestore.id/v1'
    };
  }

  // Smile.one API Integration
  async getSmileoneProducts() {
    try {
      const response = await axios.get(`${this.baseUrls.smileone}/products`, {
        headers: {
          'Authorization': `Bearer ${this.apiKeys.smileone}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Smile.one API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Smile.one products');
    }
  }

  async validateSmileoneUser(gameId, userId) {
    try {
      const response = await axios.post(`${this.baseUrls.smileone}/validate`, {
        game_id: gameId,
        user_id: userId
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKeys.smileone}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Smile.one User Validation Error:', error.response?.data || error.message);
      throw new Error('Failed to validate user');
    }
  }

  async processSmileoneOrder(orderData) {
    try {
      const response = await axios.post(`${this.baseUrls.smileone}/order`, orderData, {
        headers: {
          'Authorization': `Bearer ${this.apiKeys.smileone}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Smile.one Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
    }
  }

  // Yokcash API Integration
  async getYokcashProducts() {
    try {
      const response = await axios.get(`${this.baseUrls.yokcash}/products`, {
        headers: {
          'X-API-KEY': this.apiKeys.yokcash,
          'Content-Type': 'application/json'
        }
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
        }
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
        }
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
        }
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
        }
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
        }
      });
      return response.data;
    } catch (error) {
      console.error('Hopestore Order Error:', error.response?.data || error.message);
      throw new Error('Failed to process order');
    }
  }

  // Universal methods that route to appropriate API
  async getProducts(provider) {
    switch (provider) {
      case 'smile.one':
        return await this.getSmileoneProducts();
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
        return await this.validateSmileoneUser(gameId, userId);
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
}

module.exports = new APIService();