# How It Works — QR Attendance System Usage Guide

A step-by-step walkthrough of how teachers and students use the system in a live classroom setting.

---

## 👨‍🏫 Teacher's Side

### Step 1: First-Time Registration

If the teacher does **not** have an account yet, they need to be registered first. Currently, registration is done via the **API** (an admin would register teacher accounts):

- The system requires: **Full Name**, **University ID**, **Email**, **Password**, and **Role** (set to `teacher`)
- The university ID and email must be unique — if either is already taken, registration is rejected
- Passwords are hashed with **PBKDF2-SHA256** (260,000 iterations) before storage — the plaintext is never saved

> **Example:** An administrator registers *Dr. Ahmed Khan* with university ID `TEACH001`. The teacher then uses these credentials to log in.

If a teacher tries to **login without being registered**, they will see an **"Invalid credentials"** error on the login screen.

---

### Step 2: Login

The teacher opens the **Teacher Portal** and signs in with their university ID and password.

- If credentials are correct → a **JWT token** (valid for 24 hours) is issued and they're taken to the dashboard
- If the university ID doesn't exist → **"Invalid credentials"** error
- If the password is wrong → **"Invalid credentials"** error (same message to prevent ID enumeration)

![Teacher Login](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/teacher_login_page_1772906444478.png)

---

### Step 3: Create a Course & Enroll Students

A brand-new teacher will see an empty dashboard — **no courses, no sessions**. Here's how they set up:

1. **Create a course** — Click **"+ New Course"**, enter a course code (e.g., `CS-301`) and name (e.g., `Software Engineering`), then click **"Create Course"**
2. **Enroll students** — Click the **"Enroll"** button on the course card, enter a student's university ID (e.g., `STU001`), and click **"Enroll Student"**
   - If the student ID doesn't exist in the system → error **"Student not found"**
   - If the student is already enrolled → error **"Already enrolled"**
3. Repeat enrollment for all students in the class

> **Important:** Students must be registered in the system **before** the teacher can enroll them. If a student hasn't created their account yet, the teacher will get a "Student not found" error when trying to enroll them.

![Teacher Dashboard](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/teacher_dashboard_zero_active_sessions_1772909656428.png)

---

### Step 4: Start an Attendance Session

When class begins, the teacher clicks **"Start Session"** on their course card. This instantly:

1. Creates a new session in the database
2. Generates an **HMAC-signed QR code** with a unique nonce
3. Opens the **Live Session** view on their screen (projector/laptop)

The teacher projects this QR code on the classroom screen for students to scan.

![Live QR Session](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/teacher_qr_session_first_1772906838656.png)

> **Key security feature:** The QR code **auto-refreshes every 10 seconds** with a new nonce. This means:
> - A screenshot shared on WhatsApp becomes invalid in 10 seconds
> - Each QR code can only be used **once** (single-use nonce)
> - The countdown timer at the bottom shows when the next refresh happens

---

### Step 5: Monitor Live Attendance

While the QR code is displayed, the **Live Attendance** panel on the right updates in real-time as students scan. The teacher can see:
- How many students have scanned so far
- Student names and scan timestamps

---

### Step 6: End the Session

When class ends, the teacher clicks **"End Session"** → confirms. This:
- **Locks** the session — no more attendance can be marked
- Stops the QR code refresh loop
- Returns to the dashboard where the session shows as **LOCKED**

After locking, attendance records are **frozen** — they cannot be modified or added to.

---

## 👨‍🎓 Student's Side

### Step 1: First-Time Registration

Unlike teachers, students can **self-register** directly from the Student Portal:

1. Open the Student Portal and click **"Register"** at the bottom of the login screen
2. Fill in the registration form:
   - **Full Name** — e.g., "Ali Raza"
   - **University ID** — e.g., "STU001" (must be unique)
   - **Email** — e.g., "ali@student.edu" (must be unique)
   - **Password** — minimum 6 characters
3. Click **"Create Account"**

**What can go wrong:**
- *"University ID already registered"* — another student already used this ID
- *"Email already registered"* — the email is taken
- If any required field is missing → validation error

After successful registration, the student is redirected to the **login screen** to sign in with their new credentials.

> **Note:** The student must register **before** the teacher can enroll them in a course. If a teacher tries to enroll a university ID that isn't registered yet, they'll get a "Student not found" error.

---

### Step 2: Login

The student signs in using their university ID and password.

- If credentials are correct → **JWT token** issued, redirected to dashboard
- If the university ID doesn't exist → **"Invalid credentials"**
- If the password is wrong → **"Invalid credentials"**
- If a student accidentally opens the **Teacher Portal** → **"This portal is for students only"** error

![Student Login](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/student_login_page_1772906911919.png)

---

### Step 3: Dashboard

The student sees their enrolled courses, recent attendance history, and two main actions:
- **Scan QR Code** — to mark attendance
- **Attendance History** — to review past records

![Student Dashboard](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/student_dashboard_1772906932326.png)

---

### Step 4: Scan the QR Code

When the teacher displays the QR code in class, the student:

1. Taps **"Scan QR Code"**
2. Taps **"Start Camera"** to activate the phone's camera
3. Points the camera at the projected QR code

![QR Scanner](file:///C:/Users/askha/.gemini/antigravity/brain/c422ec82-98b3-486a-b7fa-5b79d13086ae/student_scanner_page_1772906948194.png)

The scanner reads the QR code and **automatically submits** it to the backend.

---

### Step 5: Backend Verification (happens instantly)

When the student scans, the system performs **8 security checks** in under a second:

```
✓ Step 1: Verify HMAC signature (is this QR authentic?)
✓ Step 2: Check timestamp (is this QR less than 10 seconds old?)
✓ Step 3: Check nonce reuse (has this exact QR been used before?)
✓ Step 4: Check session lock (is the session still open?)
✓ Step 5: Check enrollment (is this student in this course?)
✓ Step 6: Check duplicate (has this student already marked today?)
✓ Step 7: Verify device (is this the student's registered phone?)
✓ Step 8: Record attendance ✅
```

---

### Step 6: Confirmation & Device Binding

If all checks pass, the student sees **"✅ Attendance marked successfully!"** and their attendance history updates immediately.

**First-time scan — Device Binding:**
The very first time a student scans a QR code, the system captures a **device fingerprint** (based on screen size, graphics card, browser, timezone, etc.) and permanently binds it to their account. From that point on:
- Only **that specific phone/laptop** can mark attendance for that student
- If they try from a different device → **"Device mismatch"** error
- This prevents a friend from logging into someone else's account on their own phone

**Error messages the student might see:**
- *"QR code has expired"* — the QR is older than 10 seconds, scan the new one on screen
- *"Device mismatch"* — they're using a different phone than the one bound to their account
- *"Already marked"* — they've already scanned for this session
- *"Not enrolled in this course"* — the teacher hasn't enrolled them yet

---

## 🔒 Security in Action — Common Attack Scenarios

| Attack | What Happens |
|--------|-------------|
| **Screenshot sharing** — Student shares a photo of the QR | The QR expires in 10 seconds, and the nonce is single-use. The friend's scan will fail. |
| **Same QR scanned twice** — Student tries to submit the same QR again | Nonce is already in `used_nonces` table → rejected |
| **Absent student with a friend's phone** — Friend scans on their behalf | Device fingerprint check fails — each student's account is bound to their own phone |
| **Marking after class** — Student tries to submit after teacher clicks "End Session" | Session is locked → rejected |
| **Tampered QR data** — Student modifies the QR payload | HMAC signature verification fails → rejected |

---

## 📱 Typical Class Flow (Timeline)

```
10:00 AM  — Teacher logs in, opens CS-301
10:01 AM  — Teacher clicks "Start Session" → QR code appears on projector
10:01 AM  — QR refreshes: QR-1 (nonce: abc123...)
10:01:10  — QR refreshes: QR-2 (nonce: def456...)
10:01:20  — QR refreshes: QR-3 (nonce: ghi789...)
10:02 AM  — Students start scanning with their phones
10:02:05  — Ali Raza scans QR-5 → ✅ Attendance marked (device bound)
10:02:08  — Sara Ahmed scans QR-5 → ✅ Attendance marked
10:02:12  — Ali tries again → ❌ "Already marked for this session"
10:03 AM  — Ali shares screenshot of QR-5 to WhatsApp group
10:03:05  — Friend tries QR-5 → ❌ "QR code has expired" (it's 50+ seconds old)
10:05 AM  — All 30 students have scanned
10:50 AM  — Teacher clicks "End Session" → records locked
10:51 AM  — Late student tries to scan → ❌ "Session is locked"
```

---

## 📋 First-Time Setup Order (One-Time)

Here's the correct order of operations when setting up the system for the first time:

```
1. Admin registers teacher accounts (via API)
2. Students self-register on the Student Portal
3. Teacher logs in → creates courses
4. Teacher enrolls registered students into courses
5. System is ready — teacher can now start attendance sessions
```

> **Common mistake:** A teacher tries to enroll a student who hasn't registered yet → *"Student not found"*. The fix: have the student register first, then try enrolling again.

