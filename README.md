# MLM Activity: "Getting to Know You" Game

## Introduction
The **MLM Activity Game** is a modern, interactive team-building application built on Google Apps Script. Designed as a "Human Bingo" icebreaker, it allows team members to learn fun facts about each other through a digital 5x5 grid.

The game is highly dynamic, featuring real-time pattern detection, administrative controls, and time-gated access to ensure the activity runs strictly during scheduled event hours.

### Core Features:
*   **Seeded Shuffling:** Every player receives a unique, randomized board based on their nickname, ensuring no two players have the exact same grid layout.
*   **Smart Name Validation:** Integrated autocomplete search that pulls from a `GuestRegistration` list. It prevents "Self-Selection" and ensures each person can only be used as an answer once per board.
*   **Dynamic Pattern Engine:** Admins can create custom winning patterns (e.g., "X", "Four Corners", "Blackout") via a visual dashboard.
*   **Time-Gated Access:** The game automatically opens and closes based on "Launch" and "Close" times defined in an external Google Sheet.
*   **Achievement System:** Visual feedback with confetti celebrations and a "Progress Bar" to track board completion.

---

## Installation Instructions

### 1. Spreadsheet Setup
Your Google Sheet must contain the following tabs with specific headers:
*   **`GuestRegistration`:** Column **S** (Index 19) should contain the list of valid player nicknames.
*   **`Questions`:** Column **A** should contain the list of fun-fact questions (minimum 25).
*   **`Patterns`:** Headers: `PatternID`, `PatternName`, `TileIndices`.
*   **`EntriesLog`:** Headers: `Timestamp`, `PlayerName`, `TileIndex`, `QuestionText`, `Answer`, `CompletedPatterns`.
*   **`Leaderboard`:** Headers: `PatternName`, `PlayerName`, `Timestamp`.

### 2. Time Configuration
The script relies on an external "Time Source" spreadsheet to control game availability.
*   Update the `TIME_SOURCE.SPREADSHEET_ID` in `Code.gs` to point to your config file.
*   Ensure that sheet has a tab named `LiveHours` with the range `C8:D9` containing:
    *   `C8/D8`: Launch Date and Time.
    *   `C9/D9`: Close Date and Time.

### 3. Script Deployment
1.  Open your Google Sheet and go to **Extensions > Apps Script**.
2.  Create two files: `index.html` and `Code.gs`.
3.  Paste the provided code into each.
4.  **Admin Access:** The default admin password is set to `ADMIN123`. You can change this in the `ADMIN_PASSWORD` constant in `Code.gs`.
5.  Click **Deploy > New Deployment**.
    *   **Type:** Web App
    *   **Execute As:** Me (Admin)
    *   **Who has access:** Anyone

---

## Usage Examples

### Admin: Creating a Winning Pattern
Admins can log in using the `ADMIN_PASSWORD` (default: `ADMIN123`).
1.  Click **Create Pattern**.
2.  Enter a name (e.g., "Vertical Line").
3.  Click the tiles on the 5x5 grid to define the pattern.
4.  Click **Save Pattern**. The system will now automatically award this achievement to any player who completes those specific tiles.

### Player: Submitting an Answer
The frontend uses a secure "Seeded Shuffle" to ensure data integrity. Here is how the player action is processed:

```javascript
/**
 * Example: Processing a Tile Selection
 * The frontend sends the tile index and selected name to the backend.
 * The backend validates the name and checks for pattern completions.
 */

const actionData = {
    playerName: "Jeron",
    tileIndex: 12,
    questionText: "Has traveled to more than 5 countries",
    answer: "Michael Lao", // Selected from registration list
    clickedTiles: [0, 5, 10], // Previous progress
};

google.script.run
    .withSuccessHandler((newPatterns) => {
        if (newPatterns.length > 0) {
            alert("Pattern Unlocked: " + newPatterns.join(", "));
        }
    })
    .processPlayerAction(JSON.stringify(actionData));
```

---

## Tech Stack
*   **Frontend:** Vue.js 3 (Composition API), Bootstrap 5.3.
*   **Animation:** Canvas-Confetti, CSS3 Keyframes.
*   **Backend:** Google Apps Script (V8).
*   **Database:** Google Sheets.
*   **Cache:** Google Apps Script `CacheService` (15-second refresh for time-checks).

---

> **Warning**  
> **- For MCD Internal Use Only**  
> This application is intended for internal team engagement. It contains proprietary logic for event gamification. Unauthorized distribution or modification is prohibited.
