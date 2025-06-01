const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
dotenv.config();

const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");

async function getUserData(access_token) {
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`
  );
  const data = await response.json();

  return data;
}

router.get("/", async function (req, res, next) {
  const code = req.query.code;
  try {
    const redirectUrl = "http://localhost:3000/auth/google/callback";

    const oAuth2Client = new OAuth2Client(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      redirectUrl
    );
    const tokenResponse = await oAuth2Client.getToken(code);
    await oAuth2Client.setCredentials(tokenResponse.tokens);

    const user = oAuth2Client.credentials;
    console.log("credentials", user);

    const data = await getUserData(user.access_token);
    console.log(data);

    const checkEmail = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [data.email]
    );

    if (checkEmail.rows.length === 0) {
      await pool.query(
        "INSERT INTO users (email, full_name, created_at) VALUES ($1, $2, NOW())",
        [data.email, data.name]
      );
      console.log(
        `New user created with email: ${data.email}, name: ${data.name}`
      );
    } else {
      console.log(`User with email ${data.email} already exists`);
    }

    const userRole = await pool.query(
      "SELECT role FROM users WHERE email = $1",
      [data.email]
    );

    const token = jwt.sign(
      {
        email: data.email,
        full_name: data.name,
        role: userRole.rows[0] ? userRole.rows[0].role : null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    if (userRole.rows.length > 0 && userRole.rows[0].role) {
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/select-role`);
    }
  } catch (error) {
    console.error("Error during OAuth process:", error);
    next(error);
    res.redirect(
      `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(
        "Authentication failed"
      )}`
    );
  }
});

module.exports = router;
