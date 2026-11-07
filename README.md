# Digital Address Book - Flat Deployment

**SR University - WTMP Project (B36_Team 4)**

This folder contains a **100% Flat Architecture** where all frontend files, backend logic, and database schemas reside in a **single directory with zero subfolders**.

### File Inventory:
1. `server.js` - Complete Express server, Auth APIs, Contact APIs, and static server.
2. `db.js` - MySQL connection pool configuration.
3. `login.html` - User login page.
4. `register.html` - User registration page.
5. `index.html` - SaaS dashboard and contact table.
6. `style.css` - Full application stylesheet.
7. `auth.js` - Client-side authentication logic.
8. `app.js` - Client-side contact management and stats logic.
9. `schema.sql` - Complete MySQL schema for Workbench execution.
10. `package.json` - Dependencies and start scripts.
11. `.env` - Private database connection credentials.
12. `.env.example` - Template environment variables.
13. `.gitignore` - Git ignore rules.

### How to Run:
```bash
npm start
```
Then open: `http://localhost:3000` in your browser.
