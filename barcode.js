const express = require('express');
const router = express.Router();
const db = require('./db');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// Generate a unique QR code for a visitor
router.post('/generate-qr', async (req, res) => {
    try {
        const { visitor_id } = req.body;
        if (!visitor_id) {
            return res.status(400).json({ error: 'Visitor ID is required' });
        }

        // Generate a unique token
        const token = uuidv4();
        
        // Store the token in the database with visitor info
        const query = `
            UPDATE visitors 
            SET qr_token = ?, qr_used = FALSE 
            WHERE id = ? AND exit_time IS NULL
        `;
        
        await db.query(query, [token, visitor_id]);

        // Generate QR code
        const qrData = JSON.stringify({
            token: token,
            visitor_id: visitor_id,
            type: 'exit'
        });

        const qrCodeDataUrl = await QRCode.toDataURL(qrData);
        
        res.json({ 
            success: true, 
            qrCode: qrCodeDataUrl 
        });

    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Process QR code scan for visitor exit
router.post('/process-qr', async (req, res) => {
    try {
        const { token, visitor_id } = req.body;
        
        if (!token || !visitor_id) {
            return res.status(400).json({ error: 'Invalid QR code data' });
        }

        // Check if QR code is valid and unused
        const [visitor] = await db.query(
            'SELECT * FROM visitors WHERE id = ? AND qr_token = ? AND qr_used = FALSE AND exit_time IS NULL',
            [visitor_id, token]
        );

        if (!visitor || visitor.length === 0) {
            return res.status(400).json({ error: 'Invalid or already used QR code' });
        }

        // Update visitor exit time and mark QR as used
        const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        await db.query(
            'UPDATE visitors SET exit_time = ?, status = "out", qr_used = TRUE WHERE id = ?',
            [currentTime, visitor_id]
        );

        res.json({
            success: true,
            message: 'Visitor exit recorded successfully',
            exit_time: currentTime
        });

    } catch (error) {
        console.error('Error processing QR code:', error);
        res.status(500).json({ error: 'Failed to process QR code' });
    }
});

module.exports = router;
