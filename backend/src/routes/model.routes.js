const express = require('express');
const router = express.Router();
const { listModels, getModel, getModelPerformance } = require('../controllers/modelController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/models:
 *   get:
 *     summary: List all training LLMs for authenticated user
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of training LLMs with knowledge state
 */
router.get('/', authenticate, listModels);

/**
 * @swagger
 * /api/models/{id}:
 *   get:
 *     summary: Get a specific training LLM
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Training LLM with full knowledge state
 */
router.get('/:id', authenticate, getModel);

/**
 * @swagger
 * /api/models/{id}/performance:
 *   get:
 *     summary: Get performance tracking data for graph
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Array of performance data points
 */
router.get('/:id/performance', authenticate, getModelPerformance);

module.exports = router;
