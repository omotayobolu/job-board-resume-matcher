const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");

const updateUserRole = async (req, res, next) => {
  const { email, role } = req.body;
  const allowedRoles = ["job seeker", "recruiter"];
  try {
    if (!email || !role) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Email and role are required",
        true
      );
    }

    if (!allowedRoles.includes(role)) {
      throw new CustomError(
        "Invalid role value",
        HttpStatusCode.BAD_REQUEST,
        "BAD REQUEST",
        true
      );
    }

    const checkEmail = await pool.query(
      "SELECT * from users WHERE email = $1",
      [email]
    );
    console.log(checkEmail);

    if (checkEmail.rows.length === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User with this email does not exist",
        true
      );
    }

    await pool.query("UPDATE users SET role = $1 WHERE email = $2", [
      role,
      email,
    ]);

    res
      .status(HttpStatusCode.OK)
      .json({ message: "Role updated successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateUserRole };
