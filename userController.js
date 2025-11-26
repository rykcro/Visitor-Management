const db = require("./db");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");


// add user ------------------------------------------------------------
exports.adduser = async (req, res) => {
  try {
    const {fullname, email, username, password } = req.body;
    if (!fullname || !email || !username || !password) {
      return res.status(400).json({ message: "All user fields are required" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    // accept optional role (default to 'user')
    const role = req.body.role || 'user'

    db.query(
      "INSERT INTO users (fullname, email, username, password, role) VALUES (?, ?, ?, ?, ?)",
      [fullname, email, username, hashPassword, role],
      (err, results) => {
        if (err) return res.status(500).json({ message: err.message });
        // return created user info (no userid required)
        return res.status(201).json({ message: "User added successfully", user: { username, fullname, email, role } });
      }
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// add visitor with QR code (generate unique id and data URL)
exports.addvisitor = async (req, res) => {
  try {
  const { name, contact_no, purpose, ext_name } = req.body;
    if (!name || !contact_no || !purpose) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const qrCodeId = uuidv4();
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeId, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    // Ensure ext_name column exists (dev-friendly). Try to add it without blocking.
    db.query("ALTER TABLE visitors ADD COLUMN ext_name VARCHAR(50) NULL", () => {
      // ignore errors (column may already exist)
    });

    // Try migrating existing prefix -> ext_name if prefix column exists (non-blocking)
    db.query("UPDATE visitors SET ext_name = prefix WHERE ext_name IS NULL AND prefix IS NOT NULL", () => {
      // ignore migration errors
    });

    const sql = `INSERT INTO visitors (name, contact_no, purpose, qr_code, ext_name, status, entry_time) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
    db.query(sql, [name, contact_no, purpose, qrCodeId, ext_name || null, "IN"], (err, results) => {
      if (err) {
        console.error('DB error in addvisitor:', err);
        return res.status(500).json({ message: err.message });
      }

      res.status(201).json({
        success: true,
        message: "Visitor added successfully",
        visitor: {
          id: results.insertId,
          name,
          contact_no,
          purpose,
          qr_code: qrCodeDataURL,
          qr_code_id: qrCodeId,
          ext_name: ext_name || '',
          status: "IN",
        },
      });
    });
  } catch (err) {
    console.error('Error in addvisitor:', err);
    res.status(500).json({ message: err.message });
  }
};

// scan QR code and check out visitor (set exit_time and status OUT)
exports.scanQRCode = (req, res) => {
  try {
    const { qr_code_id } = req.body;
    if (!qr_code_id) return res.status(400).json({ message: "QR code ID is required" });

    // find visitor who is currently IN with this qr_code
    db.query(
      "SELECT * FROM visitors WHERE qr_code = ? AND status = ?",
      [qr_code_id, "IN"],
      (err, results) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!results || results.length === 0) {
          // If not found as IN, check whether the QR exists and is already OUT to provide a clearer error
          return db.query(
            "SELECT status FROM visitors WHERE qr_code = ? LIMIT 1",
            [qr_code_id],
            (err2, rows) => {
              if (err2) return res.status(500).json({ message: err2.message });
              if (rows && rows.length > 0) {
                const st = rows[0].status || '';
                if (st.toUpperCase() === 'OUT') {
                  return res.status(400).json({ success: false, message: 'Already scanned QR' });
                }
              }
              return res.status(404).json({ success: false, message: "No active visitor found with this QR code" });
            }
          );
        }

        // update visitor to OUT and set exit_time
        db.query(
          "UPDATE visitors SET exit_time = NOW(), status = ? WHERE qr_code = ?",
          ["OUT", qr_code_id],
          (err2) => {
            if (err2) return res.status(500).json({ message: err2.message });

            // return updated visitor data
            db.query(
              "SELECT id, name, contact_no, purpose, qr_code, entry_time, exit_time, status FROM visitors WHERE qr_code = ?",
              [qr_code_id],
              (err3, updated) => {
                if (err3) return res.status(500).json({ message: err3.message });
                return res.status(200).json({ success: true, visitor: updated[0] });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// view all users
exports.viewUsers = (req, res) => {
  db.query("SELECT fullname, email, username, role FROM users", (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.status(200).json(results);
  });
};

// view all visitors
exports.viewvisitors = (req, res) => {
  db.query(
    "SELECT id, name, contact_no, purpose, qr_code, ext_name, entry_time, exit_time, status FROM visitors",
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.status(200).json(results);
    }
  );
};

// generate and return QR image (PNG) for a visitor QR id or stored qr_code
exports.getVisitorQR = (req, res) => {
  const { id } = req.params
  if (!id) return res.status(400).json({ message: 'QR id required' })

  // Only search by columns that exist: qr_code (UUID string) or id (numeric primary key)
  db.query(
    "SELECT qr_code FROM visitors WHERE qr_code = ? OR id = ? LIMIT 1",
    [id, id],
    async (err, results) => {
      try {
        if (err) {
          console.error('DB error in getVisitorQR:', err)
        }

        // prefer DB value, but if not found, fall back to using the id param as the qr value
        let qrValue = null
        if (results && results.length > 0) qrValue = results[0].qr_code
        if (!qrValue) qrValue = id

        // if stored as data URL, decode and return buffer
        if (typeof qrValue === 'string' && qrValue.startsWith('data:')) {
          const m = qrValue.match(/^data:(image\/[a-zA-Z+\-\.]+);base64,(.*)$/)
          if (m) {
            const mime = m[1]
            const b64 = m[2]
            const buf = Buffer.from(b64, 'base64')
            res.setHeader('Content-Type', mime)
            res.setHeader('Content-Disposition', `inline; filename="qr_${id}.png"`)
            return res.send(buf)
          }
        }

        // ensure we have a string to encode
        const qrString = String(qrValue)
        const buf = await QRCode.toBuffer(qrString, {
          type: 'png',
          width: 300,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        })

        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Content-Disposition', `inline; filename="qr_${id}.png"`)
        return res.send(buf)
      } catch (e) {
        console.error('getVisitorQR error:', e)
        return res.status(500).json({ message: e.message })
      }
    }
  )
}

// view single user
exports.viewuser = (req, res) => {
  const { UID } = req.params; // UID is treated as username now
  db.query("SELECT fullname, email, username, role FROM users WHERE username = ?", [UID], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results || results.length === 0) return res.status(404).json({ message: "User not found" });
    res.status(200).json(results[0]);
  });
};

// delete user
exports.deleteUsers = (req, res) => {
  const { UID } = req.params; // UID is username
  db.query("DELETE FROM users WHERE username = ?", [UID], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.affectedRows === 0) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User deleted successfully" });
  });
};

// update user
exports.updateuser = async (req, res) => {
  try {
    const { UID } = req.params;
    const { fullname, email, username, password } = req.body;
    if (!fullname || !email || !username || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const hashPassword = await bcrypt.hash(password, 10);

    db.query(
      "UPDATE users SET fullname = ?, email = ?, username = ?, password = ? WHERE username = ?",
      [fullname, email, username, hashPassword, UID],
      (err) => {
        if (err) return res.status(500).json({ message: err.message });
        res.status(200).json({ message: "User updated successfully" });
      }
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// login user
exports.loginuser = (req, res) => {
  const { username, password } = req.body;
  db.query("SELECT id, fullname, email, username, password, role FROM users WHERE username = ?", [username], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results || results.length === 0) return res.status(401).json({ message: "Invalid credentials" });

    const user = results[0];

    try {
      // First try bcrypt compare (expected for hashed passwords)
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (isMatch) {
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        return res.status(200).json({ message: "Login successful", token, user: { username: user.username, fullname: user.fullname, email: user.email, role: user.role } });
      }

      // Fallback: support legacy plaintext passwords stored in DB.
      // If the provided password exactly equals the stored value, migrate it to a bcrypt hash.
      if (user.password && password === user.password) {
        const hashPassword = await bcrypt.hash(password, 10);
        db.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword, user.id], (uErr) => {
          if (uErr) console.warn('Failed to migrate plaintext password for user', user.username, uErr.message || uErr);
          // Issue token after migration (even if migration write failed, the password matched so allow login)
          const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
          return res.status(200).json({ message: "Login successful", token, user: { username: user.username, fullname: user.fullname, email: user.email, role: user.role } });
        });
        return;
      }

      // No match
      return res.status(401).json({ message: "Invalid credentials" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  });
};

// return current user based on JWT
exports.me = (req, res) => {
  const payload = req.users; // set by authMiddleware
  if (!payload || !payload.username) return res.status(401).json({ message: "Unauthorized" });

  const username = payload.username;
  db.query("SELECT fullname, email, username, role FROM users WHERE username = ?", [username], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results || results.length === 0) return res.status(404).json({ message: "User not found" });
    res.status(200).json(results[0]);
  });
};


