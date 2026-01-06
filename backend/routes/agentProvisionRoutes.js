const express = require('express');
const router = express.Router();
const { provisionAgentToken } = require('../controllers/agentProvisionController');

// POST /api/agent/provision
router.post('/provision', provisionAgentToken);

// GET /api/agent/download
router.get('/download', (req, res) => {
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(__dirname, '../public/downloads/DeskLinkAgent.exe');

    if (fs.existsSync(filePath)) {
        res.download(filePath, 'DeskLinkAgent.exe');
    } else {
        res.status(404).send('Agent installer not found. Please contact support.');
    }
});

module.exports = router;
