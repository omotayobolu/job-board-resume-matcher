const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");

const createRecruiterProfile = async (req, res, next) => {
  const { user_id, type_of_organization, location } = req.body;
  try {
    if (!user_id || !type_of_organization || !location) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Type of organization and location are required",
        true
      );
    }

    const userCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [user_id]
    );

    console.log(userCheck);
    if (userCheck.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User with the given ID does not exist.",
        true
      );
    }

    const user = userCheck.rows[0];

    if (user.role === "job seeker") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Job seekers cannot create a recruiter profile.",
        true
      );
    }

    const result = await pool.query(
      "INSERT INTO recruiter (user_id, type_of_organization, location, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *",
      [user_id, type_of_organization, location]
    );

    console.log(result);

    const recruiter = result.rows[0];
    res
      .status(HttpStatusCode.OK)
      .json({ recruiter, message: "Profile created successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { createRecruiterProfile };
