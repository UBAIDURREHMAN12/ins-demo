require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const db = require("./database");
const path = require("path");
require("dotenv").config(); // Loads .env file (optional, for local dev)

const app = express();
app.use(cors());

app.use(
  cors({
    credentials: true,
    // origin : process.env.FRONTEND_URL || ''
  })
);
app.use(express.json());


var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Register User
app.post("/api/register", async (request, response) => {
  try {
    const { first_name, last_name, email, password, role } = request.body;

    // **Check if all required fields are provided**
    if (!first_name || !last_name || !email || !password || !role) {
      return response.status(400).json({
        message: "Provide first_name, last_name, email, password, and role",
        error: true,
        success: false,
      });
    }

    // **Check if user already exists**
    db.get(
      `SELECT * FROM users WHERE email = ?`,
      [email],
      async (err, user) => {
        if (err) {
          return response.status(500).json({
            message: "Database error while checking user",
            error: true,
            success: false,
          });
        }

        if (user) {
          return response.status(400).json({
            message: "Email already registered",
            error: true,
            success: false,
          });
        }

        try {
          // **Hash password**
          const salt = await bcrypt.genSalt(10);
          const hashPassword = await bcrypt.hash(password, salt);

          // **Insert new user**
          db.run(
            `INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)`,
            [first_name, last_name, email, hashPassword, role],
            function (err) {
              if (err) {
                return response.status(500).json({
                  message: "Error registering user",
                  error: true,
                  success: false,
                });
              }

              const userId = this.lastID;

              return response.json({
                message: "User registered successfully",
                error: false,
                success: true,
                data: { id: userId, first_name, last_name, email, role },
              });
            }
          );
        } catch (error) {
          return response.status(500).json({
            message: error.message || "Error hashing password",
            error: true,
            success: false,
          });
        }
      }
    );
  } catch (error) {
    return response.status(500).json({
      message: error.message || "Internal Server Error",
      error: true,
      success: false,
    });
  }
});

// Login User
// Login API
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user)
      return res.status(401).json({ error: "Invalid email or password" });

    // const isMatch = await bcrypt.compare(password, user.password);
    // if (!isMatch)
    //   return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      "08098098kijkju998",
      { expiresIn: "1h" }
    );

    const roles = user.role.split(",");

    user.roles = roles;

    res.json({
      token,
      user,
    });
  });
});

// Middleware: Authenticate User
const authenticate = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(403).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token.split(" ")[1], SECRET_KEY);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid Token" });
  }
};

// Logout API (handled in frontend by removing token)
app.post("/logout", (req, res) => {
  res.json({ message: "User logged out successfully" });
});

// Get Sidebar Menu Based on Role
app.get("/api/menu/sidebar", authenticate, (req, res) => {
  const menus = {
    sales_marketing: [
      "Revenue Insights",
      "New Business vs. Renewals",
      "Sales Team Performance",
      "Broker Performance",
    ],
    underwriting: ["Policy", "Customer", "Broker"],
    claims: ["Claim", "Customer", "Broker", "Recoveries"],
    operations: ["Sales", "Underwriting", "Claims"],
    actuarial: [
      "Premium & Pricing Insights",
      "Risk & Exposure Analysis",
      "Portfolio Performance",
    ],
    management: [
      "Financial Summary",
      "Company-Wide KPIs",
      "Market Share Analytics",
      "AI-Driven Forecasting",
    ],
  };

  res.json({ menus: menus[req.user.role] || [] });
});

app.get("/api/veh-type/:id", (req, res) => {
  const primaryKey = req.params.id;
  const query = "SELECT * FROM pol_veh_type WHERE PNC = ?";

  db.get(query, [primaryKey], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Data not found" });
    }

    // Filter out keys where the value is greater than 0
    const filteredData = Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) => !isNaN(value) && Number(value) > 0
      )
    );

    // Create final structure for Y-axis and Tooltip
    const finalData = {};

    Object.entries(filteredData).forEach(([key, value]) => {
      // Exclude unwanted keys
      if (
        !key.endsWith("_Prem") &&
        !key.endsWith("_SI") &&
        key !== "id" &&
        key !== "PNC" &&
        key !== "InsuredPNC"
      ) {
        finalData[key] = {
          value, // Y-axis value
          tooltip: {
            Prem: filteredData[`${key}_Prem`] || 0,
            SI: filteredData[`${key}_SI`] || 0,
          },
        };
      }
    });

    res.json(finalData);
  });
});

app.get("/api/pol-veh-cat/:id", (req, res) => {
  const primaryKey = req.params.id;
  const query = "SELECT * FROM pol_veh_cat WHERE PNC = ?";

  db.get(query, [primaryKey], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Data not found" });
    }

    // Filter out keys where the value is greater than 0
    const filteredData = Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) => !isNaN(value) && Number(value) > 0
      )
    );

    // Create final structure for Y-axis and Tooltip
    const finalData = {};

    Object.entries(filteredData).forEach(([key, value]) => {
      // Exclude unwanted keys
      if (
        !key.endsWith("_Prem") &&
        !key.endsWith("_SI") &&
        key !== "id" &&
        key !== "PNC" &&
        key !== "InsuredPNC"
      ) {
        finalData[key] = {
          value, // Y-axis value
          tooltip: {
            Prem: filteredData[`${key}_Prem`] || 0,
            SI: filteredData[`${key}_SI`] || 0,
          },
        };
      }
    });

    res.json(finalData);
  });
});

app.get("/api/pol-veh-group/:id", (req, res) => {
  const primaryKey = req.params.id;
  const query = "SELECT * FROM pol_veh_grp WHERE PNC = ?";

  db.get(query, [primaryKey], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Data not found" });
    }

    // Filter out keys where the value is greater than 0
    const filteredData = Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) => !isNaN(value) && Number(value) > 0
      )
    );

    // Create final structure for Y-axis and Tooltip
    const finalData = {};

    Object.entries(filteredData).forEach(([key, value]) => {
      // Exclude unwanted keys
      if (
        !key.endsWith("_Prem") &&
        !key.endsWith("_SI") &&
        key !== "id" &&
        key !== "PNC" &&
        key !== "InsuredPNC"
      ) {
        finalData[key] = {
          value, // Y-axis value
          tooltip: {
            Prem: filteredData[`${key}_Prem`] || 0,
            SI: filteredData[`${key}_SI`] || 0,
          },
        };
      }
    });

    res.json(finalData);
  });
});

app.get("/api/policy-mov/:id", (req, res) => {
  const primaryKey = req.params.id;
  const query = "SELECT * FROM pol_mov WHERE PNC = ?";

  db.get(query, [primaryKey], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Data not found" });
    }

    res.json(row);
  });
});

app.get("/api/card-claim/:id", (req, res) => {
  const primaryKey = req.params.id;
  const query = "SELECT * FROM policy_claim WHERE PNC = ?";

  db.get(query, [primaryKey], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Data not found" });
    }

    const filteredData = Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) => !isNaN(value) && Number(value) > 0
      )
    );

    res.json(filteredData);
  });
});

app.get("/api/pol-lvl-veh/:pnc", (req, res) => {
  const { pnc } = req.params;

  db.get("SELECT * FROM pol_lvl_veh WHERE PNC = ?", [pnc], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ message: "No data found" });
    }

    // Get all rows where InsuredPNC matches
    db.all(
      "SELECT * FROM pol_lvl_veh WHERE InsuredPNC = ?",
      [row.InsuredPNC],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows); // returns array of rows
      }
    );
  });
});

app.get("/api/primary-claims/:pnc", (req, res) => {
  const { pnc } = req.params;

  db.get("SELECT * FROM primary_claims WHERE PNC = ?", [pnc], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ message: "No data found" });
    }

    // Get all rows where InsuredPNC matches
    db.all(
      "SELECT * FROM primary_claims WHERE InsuredPNC = ?",
      [row.InsuredPNC],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows); // returns array of rows
      }
    );
  });
});
// API route to fetch all data from `pol_lvl_pol` table
app.get("/api/pol_lvl_pol", (req, res) => {
  const sql = "SELECT * FROM pol_lvl_pol";

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API endpoint to get a single row where PNC = pnc
app.get("/api/getPolicy/:pnc", (req, res) => {
  const { pnc } = req.params;

  db.get("SELECT * FROM pol_lvl_pol WHERE PNC = ?", [pnc], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: "No record found" });
    }
    res.json(row);
  });
});

// ✅ Use dynamic port from Azure
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
