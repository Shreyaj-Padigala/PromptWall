const express = require('express');
const router = express.Router();
const { submitPrompt, getPrompt } = require('../controllers/promptController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/prompts:
 *   post:
 *     summary: Submit a prompt for analysis
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id, prompt_text]
 *             properties:
 *               session_id: { type: integer }
 *               prompt_text: { type: string }
 *     responses:
 *       200:
 *         description: Full analysis result with training response, ground truth, evaluation, and agent outputs
 */
router.post('/', authenticate, submitPrompt);

/**
 * @swagger
 * /api/prompts/{id}:
 *   get:
 *     summary: Get prompt details with all responses and agent logs
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Full prompt record with agent activity
 */
router.get('/:id', authenticate, getPrompt);

module.exports = router;
