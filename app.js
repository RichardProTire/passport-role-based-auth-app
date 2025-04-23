require("dotenv").config();
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const pgSession = require("connect-pg-simple")(session);
const validator = require("validator");


const app = express();

//unique passcodes for membership and admin are in .env
const CLUB_PASSCODE = process.env.CLUB_PASSCODE;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;


// PostgreSQL Pool details
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    store: new pgSession({
      pool: pool, 
      tableName: "session", 
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
//used for styles.css and theme-toggle(dark mode)
app.use(express.static(path.join(__dirname, "public")));
app.use(passport.initialize());
app.use(passport.session());

// Passport LocalStrategy
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      const user = rows[0];

      if (!user) {
        return done(null, false, { message: "Incorrect username" });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, rows[0]);
  } catch (err) {
    done(err);
  }
});

// Make user available in all views (.ejs)
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// Routes
app.get("/", async (req, res, next) => {
    try {
      const { rows: messages } = await pool.query(
        `SELECT messages.id, messages.title, messages.content, messages.created_at,
                users.first_name, users.last_name
         FROM messages
         JOIN users ON messages.user_id = users.id
         ORDER BY messages.created_at DESC`
      );
  
      res.render("index", {
        messages,
        currentUser: req.user || null
      });
    } catch (err) {
      next(err);
    }
});
  
  

app.get("/sign-up", (req, res) => {
  res.render("sign-up-form");
});

app.post("/sign-up", async (req, res, next) => {
    const { first_name, last_name, username, password, confirmPassword } = req.body;
    try {
      // User validation
      if (!first_name || !last_name || !username || !password || !confirmPassword) {
        return res.status(400).send("All fields are required.");
      }
  
      if (!validator.isEmail(username)) {
        return res.status(400).send("Username must be a valid email.");
      }
  
      if (password !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
  
      await pool.query(
        `INSERT INTO users (first_name, last_name, username, password)
         VALUES ($1, $2, $3, $4)`,
        [first_name.trim(), last_name.trim(), username.toLowerCase().trim(), hashedPassword]
      );
      
  
      res.redirect("/");
    } catch (err) {
      console.error(err);
      next(err);
    }
  });

app.post(
  "/log-in",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/",
  })
);

app.get("/log-out", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/join-club", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
    res.render("join-club");
  });
  
  app.post("/join-club", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
  
    const { passcode } = req.body;
  
    if (passcode === CLUB_PASSCODE) {
      try {
        await pool.query(
          "UPDATE users SET membership_status = true WHERE id = $1",
          [req.user.id]
        );
        return res.redirect("/");
      } catch (err) {
        return next(err);
      }
    } else {
      return res.send("Incorrect passcode. <a href='/join-club'>Try again</a>");
    }
});

app.get("/messages/new", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
    res.render("new-message");
});
  
app.post("/messages/new", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
  
    const { title, content } = req.body;
    //A post requires both a title/subject and post content
    if (!title || !content) {
      return res.status(400).send("Both title and content are required.");
    }
  
    try {
      await pool.query(
        "INSERT INTO messages (title, content, user_id) VALUES ($1, $2, $3)",
        [title.trim(), content.trim(), req.user.id]
      );
      res.redirect("/");
    } catch (err) {
      next(err);
    }
});
  
app.post("/messages/:id/delete", async (req, res, next) => {
    if (!req.isAuthenticated() || !req.user.is_admin) {
      return res.status(403).send("Unauthorized");
    }
  
    try {
      await pool.query("DELETE FROM messages WHERE id = $1", [req.params.id]);
      res.redirect("/");
    } catch (err) {
      next(err);
    }
});
// becoming an admin is similar to becoming a member. You need to know the code stored in .env
app.get("/become-admin", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
    res.render("become-admin");
  });
  
  app.post("/become-admin", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }
  
    const { passcode } = req.body;
  
    if (passcode === ADMIN_PASSCODE) {
      try {
        await pool.query(
          "UPDATE users SET is_admin = true WHERE id = $1",
          [req.user.id]
        );
        return res.redirect("/");
      } catch (err) {
        return next(err);
      }
    } else {
      return res.send("❌ Incorrect passcode. <a href='/become-admin'>Try again</a>");
    }
});
  

app.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
