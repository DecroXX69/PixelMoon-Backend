const APIService = require('../services/apiService');

exports.getBalances = async (req, res) => {
  const [yh, hr, sp] = await Promise.all([
    APIService.getYokcashBalance(),
    APIService.getHopestoreBalance(),
    APIService.getSmileonePoints('mobilelegends')
  ]);
  res.json({ success:true, balances: { yokcash: yh, hopestore: hr, smileone: sp }});
};
