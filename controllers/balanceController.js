const APIService = require('../services/apiService');

exports.getBalances = async (req, res) => {
  let yokRes  = null;
  let hopeRes = null;
  let smileRes = null;

  // 1) Yokcash
  try {
    yokRes = await APIService.getYokcashBalance();
  } catch (e) {
    console.error('Yokcash balance fetch failed:', e.message);
    yokRes = { status:false, msg: 'unavailable', data: 0 };
  }

  // 2) Hopestore
  try {
    hopeRes = await APIService.getHopestoreBalance();
  } catch (e) {
    console.error('Hopestore balance fetch failed:', e.message);
    hopeRes = { status:false, msg: 'unavailable', data: 0 };
  }

  // 3) Smile.one (don’t forget to supply a valid product slug)
  try {
  smileRes = await APIService.getSmileonePoints('mobilelegends');
  console.log('Smile.one response:', smileRes);
} catch (e) {
  console.error('Smile.one error:', e.message);
}

  return res.status(200).json({
    success: true,
    balances: {
      yokcash:   yokRes.data   || 0,
      hopestore: hopeRes.data  || 0,
      smileone:  smileRes.smile_points || '0'
    }
  });
};

