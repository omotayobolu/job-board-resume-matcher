const express = require("express");
const { updateUserRole } = require("../controllers/userController");
const router = express.Router();

router.patch("/update-role", updateUserRole);

module.exports = router;
