const express = require('express');
const router = express.Router();
const { createSession, listSessions, getSession, endSession } = require('../controllers/sessionController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Start a new training session
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [training_llm_id]
 *             properties:
 *               training_llm_id: { type: integer }
 *     responses:
 *       201:
 *         description: Session created
 */
router.post('/', authenticate, createSession);

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List all sessions for the authenticated user
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of sessions with summary stats
 */
router.get('/', authenticate, listSessions);

/**
 * @swagger
 * /api/sessions/{id}:
 *   get:
 *     summary: Get session details including all prompts
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Full session with prompts, responses, and evaluations
 */
router.get('/:id', authenticate, getSession);

/**
 * @swagger
 * /api/sessions/{id}/end:
 *   patch:
 *     summary: End an active training session
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Session ended
 */
router.patch('/:id/end', authenticate, endSession);

module.exports = router;
