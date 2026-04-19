const express = require('express');
const router = express.Router();
const { submitPrompt, generateNextPrompt, getPrompt } = require('../controllers/promptController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/prompts/generate:
 *   post:
 *     summary: Generate the next prompt for an active training session
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id]
 *             properties:
 *               session_id: { type: integer }
 *     responses:
 *       200:
 *         description: Generated prompt recommendation and generation metadata
 */
router.post('/generate', authenticate, generateNextPrompt);

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
 *               source: { type: string, enum: [manual, auto_generated] }
 *               generation_reasoning: { type: string }
 *               target_failure_mode: { type: string }
 *               difficulty: { type: string }
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
