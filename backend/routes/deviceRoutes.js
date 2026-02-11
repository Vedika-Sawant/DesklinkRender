const express = require('express');
const { registerDevice, setDeviceBlock, softDeleteDevice, updateHeartbeat, getDeviceStatus, getUserDeviceStatus } = require('../controllers/deviceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', protect, registerDevice);
router.post('/heartbeat', protect, updateHeartbeat);
router.get('/:deviceId/status', protect, getDeviceStatus);
router.get('/user/:userId/status', protect, getUserDeviceStatus);

router.post('/block', protect, setDeviceBlock); // alias per spec
router.patch('/:deviceId/block', protect, setDeviceBlock);
router.post('/delete', protect, softDeleteDevice); // alias per spec
router.delete('/:deviceId', protect, softDeleteDevice);

module.exports = router;


