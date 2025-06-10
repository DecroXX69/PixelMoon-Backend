const express = require('express');
const Banner = require('../models/Banner');
const router = express.Router();

// GET /api/admin/banners - Get all banners for admin
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/banners - Create new banner
router.post('/', async (req, res) => {
  try {
    const { imageUrl, altText, link, title, category } = req.body;
    
    // Get next order number
    const lastBanner = await Banner.findOne().sort({ order: -1 });
    const order = lastBanner ? lastBanner.order + 1 : 1;
    
    const banner = new Banner({
      imageUrl,
      altText,
      link,
      title,
      category,
      order
    });
    
    const savedBanner = await banner.save();
    res.status(201).json(savedBanner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT /api/admin/banners/:id/reorder - Reorder banners
router.put('/reorder', async (req, res) => {
  try {
    const { bannerIds } = req.body; // Array of banner IDs in new order
    
    const updatePromises = bannerIds.map((id, index) =>
      Banner.findByIdAndUpdate(id, { order: index + 1 })
    );
    
    await Promise.all(updatePromises);
    res.json({ message: 'Banners reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/admin/banners/:id - Update banner
router.put('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    res.json(banner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/admin/banners/:id - Delete banner
router.delete('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    res.json({ message: 'Banner deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// Public route - GET /api/banners - Get active banners for frontend
// router.get('/', async (req, res) => {
//   try {
//     const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
//     res.json(banners);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

module.exports = router;