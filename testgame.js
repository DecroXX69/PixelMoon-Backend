// testGameApi.js
const axios = require('axios');
const API = axios.create({
  baseURL: 'https://www.pixelmoonstore.in/api/v1',
  headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODJmMzg1MTg4ZGZhYThmOGNlNDhlMzMiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NDgzMzkwNDQsImV4cCI6MTc1MDkzMTA0NH0.5Q8ot3eip85pyGIZ27w0XRWM5H44JP-mg5VyjdnsesU' }
});

async function run() {
  // 1) Create game
 const { data } = await API.post('/games', {
  name: 'PUBG UC',
  description: 'Buy UC top-ups instantly.',
  image: 'https://example.com/pubg.jpg',
  apiProvider: 'yokcash', // or 'yokcash'
  apiGameId: 'pubg-uc',     // optional but helps with internal tracking
  region: 'GLOBAL',         // if applicable
  category: 'Mobile Games',
  packs: []                 // initially empty
});
console.log('Game created:', data);
const gameId = data.game._id;

  // 2) Add pack
  const pack = await API.post(`/games/${gameId}/packs`, {
  packId: 'hk123',        // manually chosen for your reference
  name: '325 UC',
  amount: 325,
  retailPrice: 400,
  resellerPrice: 370,
  costPrice: 350
});
console.log('Pack added:', pack.data);

  // 3) Fetch game
  ({ data } = await API.get(`/games/${gameId}`));
  console.log('Fetch Game:', data);
}

run().catch(e => console.error(e.response?.data || e.message));
