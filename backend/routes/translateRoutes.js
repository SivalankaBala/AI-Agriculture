const express = require('express');
const router = express.Router();
const { translateText, translateObject } = require('../services/geminiService');

router.post('/', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        if (!text || !targetLanguage) {
            return res.status(400).json({ message: "Text and targetLanguage are required" });
        }
        
        if (targetLanguage === 'en') {
            return res.json({ translatedText: text });
        }

        // Use Gemini API for real agricultural translation
        const translatedText = await translateText(text, targetLanguage);

        res.json({ translatedText });
    } catch (error) {
        console.error("Translation error:", error);
        // Fallback to returning the original text on error
        res.json({ translatedText: req.body.text || "" });
    }
});

router.post('/object', async (req, res) => {
    try {
        const { obj, targetLanguage } = req.body;
        
        if (!obj || !targetLanguage) {
            return res.status(400).json({ message: "obj and targetLanguage are required" });
        }
        
        if (targetLanguage === 'en') {
            return res.json({ translatedObject: obj });
        }

        const translatedObject = await translateObject(obj, targetLanguage);

        res.json({ translatedObject });
    } catch (error) {
        console.error("Object Translation error:", error);
        res.json({ translatedObject: req.body.obj || {} });
    }
});

module.exports = router;
