import express from 'express';
const router = express.Router();

const logoutController = require('../controller/logoutController');

router.delete('/', logoutController.logout);

module.exports = router;
