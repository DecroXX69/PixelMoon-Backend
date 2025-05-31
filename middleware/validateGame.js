// middleware/validateGame.js
const Joi = require('joi');

const gameSchema = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().required(),
  image: Joi.string().uri().required(),
  apiProvider: Joi.string().valid('smile.one','yokcash','hopestore').required(),
  apiGameId: Joi.string().required(),
  region: Joi.string().required(),
  category: Joi.string().default('Mobile Games'),
  packs: Joi.array().items(
    Joi.object({
      packId: Joi.string().required(),
      name: Joi.string().required(),
      amount: Joi.number().required(),
      retailPrice: Joi.number().required(),
      resellerPrice: Joi.number().required(),
      costPrice: Joi.number().required()
    })
  ).required()
});

module.exports = (req, res, next) => {
  const { error } = gameSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid game payload',
      details: error.details.map(d => d.message)
    });
  }
  next();
};
