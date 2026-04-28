/**
 * @OnlyCurrentDoc
 */

// --- GLOBAL CONFIGURATION ---

const REGISTRATION_CONFIG = {
    TAB_NAME: "GuestRegistration",
    COLUMN_INDEX: 19, // Column S
    START_ROW: 3,
};

const QUESTION_CONFIG = {
    TAB_NAME: "Questions",
    COLUMN_INDEX: 1, // Column A
    START_ROW: 2,
};

const SHEET_CONFIG = {
    Patterns: ["PatternID", "PatternName", "TileIndices"],
    EntriesLog: ["Timestamp", "PlayerName", "TileIndex", "QuestionText", "Answer", "CompletedPatterns"],
    Leaderboard: ["PatternName", "PlayerName", "Timestamp"],
};

// --- TIME CONFIGURATION (DYNAMIC SOURCE) ---
const TIME_SOURCE = {
    SPREADSHEET_ID: "1n-5jkQyxkdc7hERqS6j3I-Hm3gKSQH-iuqj0XVWV9X8",
    TAB_NAME: "LiveHours",
    // Data range covers C8:D9 
    // Row 1 (C8, D8) = Launch Date, Launch Time
    // Row 2 (C9, D9) = Close Date, Close Time
    DATA_RANGE: "C8:D9" 
};

const ADMIN_PASSWORD = "ADMIN123";

function doGet(e) {
    const htmlOutput = HtmlService.createTemplateFromFile("index").evaluate();
    htmlOutput
        .setTitle("MLM Activity")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
    return htmlOutput;
}

// --- NEW TIME HELPER FUNCTIONS ---

/**
 * Fetches Launch and Close times from external sheet.
 * CACHE is set to 15 SECONDS.
 * If you update the sheet, wait 15 seconds, then refresh the game.
 */
function getGameSchedule() {
    const cache = CacheService.getScriptCache();
    const cachedConfig = cache.get("DYNAMIC_SCHEDULE_CONFIG");

    if (cachedConfig) {
        // Parse stored JSON strings back into Date objects
        const parsed = JSON.parse(cachedConfig);
        return {
            LAUNCH: new Date(parsed.LAUNCH),
            CLOSE: new Date(parsed.CLOSE)
        };
    }

    // If not in cache, fetch from the external spreadsheet
    try {
        const ss = SpreadsheetApp.openById(TIME_SOURCE.SPREADSHEET_ID);
        const sheet = ss.getSheetByName(TIME_SOURCE.TAB_NAME);
        
        if (!sheet) throw new Error(`Tab "${TIME_SOURCE.TAB_NAME}" not found in time config file.`);

        // Get values from C8:D9
        // values[0][0] = C8 (LaunchDate), values[0][1] = D8 (LaunchTime)
        // values[1][0] = C9 (CloseDate),  values[1][1] = D9 (CloseTime)
        const values = sheet.getRange(TIME_SOURCE.DATA_RANGE).getValues();

        const launchTime = combineDateAndTime(values[0][0], values[0][1]);
        const closeTime = combineDateAndTime(values[1][0], values[1][1]);

        const config = {
            LAUNCH: launchTime,
            CLOSE: closeTime
        };

        // SAVE TO CACHE FOR ONLY 15 SECONDS
        // This ensures updates in the sheet are reflected almost immediately
        cache.put("DYNAMIC_SCHEDULE_CONFIG", JSON.stringify(config), 15);

        return config;

    } catch (e) {
        throw new Error("Failed to load game schedule: " + e.message);
    }
}

/**
 * Strictly combines Date cell and Time cell into one Date Object
 * Uses getFullYear/getHours etc to avoid calculation errors.
 */
function combineDateAndTime(datePart, timePart) {
    // If cells are empty or invalid
    if (!datePart || !timePart) return new Date(); 

    // We expect datePart and timePart to be Date objects from the sheet
    const dObj = new Date(datePart);
    const tObj = new Date(timePart);

    // Extract YMD from the date cell
    const year = dObj.getFullYear();
    const month = dObj.getMonth();
    const day = dObj.getDate();

    // Extract HMS from the time cell
    const hours = tObj.getHours();
    const minutes = tObj.getMinutes();
    const seconds = tObj.getSeconds();

    return new Date(year, month, day, hours, minutes, seconds);
}

// --- SECURITY & VALIDATION HELPERS ---

function verifyAdmin(submittedKey) {
    if (!submittedKey || submittedKey !== ADMIN_PASSWORD) {
        throw new Error("⛔ Unauthorized: Invalid Admin Credentials.");
    }
}

function isPlayerRegistered(nameToCheck) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REGISTRATION_CONFIG.TAB_NAME);
    if (!sheet) return false;

    const lastRow = sheet.getLastRow();
    if (lastRow < REGISTRATION_CONFIG.START_ROW) return false;

    const numRows = lastRow - REGISTRATION_CONFIG.START_ROW + 1;
    const values = sheet
        .getRange(REGISTRATION_CONFIG.START_ROW, REGISTRATION_CONFIG.COLUMN_INDEX, numRows, 1)
        .getValues();

    return values.some((row) => row[0] && row[0].toString().trim().toUpperCase() === nameToCheck);
}

function fetchRegisteredPlayerNames() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REGISTRATION_CONFIG.TAB_NAME);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < REGISTRATION_CONFIG.START_ROW) return [];

    const numRows = lastRow - REGISTRATION_CONFIG.START_ROW + 1;
    const values = sheet
        .getRange(REGISTRATION_CONFIG.START_ROW, REGISTRATION_CONFIG.COLUMN_INDEX, numRows, 1)
        .getValues();

    return values
        .map((row) => row[0])
        .filter((name) => name && name.toString().trim() !== "")
        .map((name) => name.toString().trim());
}

function fetchQuestionsSimple() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(QUESTION_CONFIG.TAB_NAME);

    if (!sheet) {
        sheet = ss.insertSheet(QUESTION_CONFIG.TAB_NAME);
        sheet.getRange(1, 1).setValue("QuestionText");
        return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < QUESTION_CONFIG.START_ROW) return [];

    const numRows = lastRow - QUESTION_CONFIG.START_ROW + 1;
    const values = sheet.getRange(QUESTION_CONFIG.START_ROW, QUESTION_CONFIG.COLUMN_INDEX, numRows, 1).getValues();

    return values.filter((row) => row[0] !== "").map((row) => ({ questiontext: row[0].toString() }));
}

// --- INITIALIZATION (UPDATED WITH DYNAMIC TIME CHECK) ---

function getInitialData(playerName) {
    try {
        const cleanName = playerName.toString().trim().toUpperCase();

        // Check if user is Admin
        if (cleanName !== ADMIN_PASSWORD) {
            
            // --- TIME RESTRICTION LOGIC ---
            // Fetch schedule dynamically from external sheet
            const schedule = getGameSchedule(); 
            const now = new Date();
            const timeZone = Session.getScriptTimeZone();

            // 1. Check if too early
            if (now < schedule.LAUNCH) {
                const launchStr = Utilities.formatDate(schedule.LAUNCH, timeZone, "MMM dd, yyyy 'at' h:mm a");
                return { error: "⏳ Game starts on " + launchStr };
            }

            // 2. Check if too late
            if (now > schedule.CLOSE) {
                const closeStr = Utilities.formatDate(schedule.CLOSE, timeZone, "MMM dd, yyyy 'at' h:mm a");
                return { error: "⛔ Game closed. The activity ended on " + closeStr };
            }
            // -----------------------------

            if (!isPlayerRegistered(cleanName)) {
                return { error: "Access Denied: Your name was not found in the 'Registration' list." };
            }
        }

        // 1. Questions
        let questions = getCachedData("questions_data");
        if (!questions || questions.length === 0) {
            questions = fetchQuestionsSimple();
            if (questions.length > 0) setCachedData("questions_data", questions, 3600);
        }

        // 2. Patterns
        let patterns = getCachedData("patterns_data");
        if (!patterns) {
            ensureSheetAndHeadersExist("Patterns");
            patterns = getSheetData("Patterns");
            setCachedData("patterns_data", patterns, 3600);
        }

        // 3. Player Progress & Used Answers
        ensureSheetAndHeadersExist("EntriesLog");
        const allEntries = getSheetData("EntriesLog");

        let playerProgress = []; // Indices
        let completedPatternsHistory = new Set();
        let usedAnswers = new Set(); // Names already used

        allEntries.forEach((row) => {
            if (row["playername"] && row["playername"].toString().trim().toUpperCase() === cleanName) {
                // Collect Tile Index
                const val = parseInt(row["tileindex"], 10);
                if (!isNaN(val)) playerProgress.push(val);

                // Collect Answer (to prevent reuse)
                if (row["answer"]) {
                    usedAnswers.add(row["answer"].toString().trim().toUpperCase());
                }
            }
        });

        // Sync with Leaderboard
        const leaderboardData = getSheetData("Leaderboard");
        leaderboardData.forEach((row) => {
            if (row["playername"] && row["playername"].toString().trim().toUpperCase() === cleanName) {
                completedPatternsHistory.add(row["patternname"]);
            }
        });

        const registeredNames = fetchRegisteredPlayerNames();

        return {
            questions,
            patterns,
            playerProgress: [...new Set(playerProgress)],
            completedPatterns: Array.from(completedPatternsHistory),
            registeredNames,
            usedAnswers: Array.from(usedAnswers), 
        };
    } catch (e) {
        return { error: "Could not fetch initial game data: " + e.message };
    }
}

// --- PLAYER ACTION ---

function processPlayerAction(actionData) {
    let data;
    try {
        data = JSON.parse(actionData);
    } catch (e) {
        return { error: "Invalid JSON data" };
    }

    const cleanPlayerName = data.playerName.toString().trim().toUpperCase();
    const cleanAnswer = data.answer ? data.answer.toString().trim().toUpperCase() : "";

    // Validation
    if (!cleanAnswer) return { error: "Please enter a name." };

    // --- CHECK: PREVENT SELF-SELECTION ---
    if (cleanAnswer === cleanPlayerName) {
        return { error: "⛔ You cannot choose yourself as an answer!" };
    }
    
    // --- CHECK: TIME LIMIT FOR SUBMISSION ---
    // Double check time here to prevent users staying on the page after close
    if (cleanPlayerName !== ADMIN_PASSWORD) {
        const schedule = getGameSchedule(); // Fetch dynamic time
        const now = new Date();
        if (now > schedule.CLOSE) {
             return { error: "⛔ Submission Failed: The game is now closed." };
        }
    }

    if (!isPlayerRegistered(cleanAnswer)) {
        return { error: "❌ Name Not Found: '" + data.answer + "' is not in the Registration list." };
    }

    const playerClickedIndices = new Set(data.clickedTiles || []);
    playerClickedIndices.add(parseInt(data.tileIndex, 10));

    let patterns = getCachedData("patterns_data");
    if (!patterns) patterns = getSheetData("Patterns");

    const lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
        try {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            const leaderboardSheet = ss.getSheetByName("Leaderboard") || ensureSheetAndHeadersExist("Leaderboard");
            const entriesSheet = ss.getSheetByName("EntriesLog") || ensureSheetAndHeadersExist("EntriesLog");

            // Check existing patterns on server
            const lbValues = leaderboardSheet.getDataRange().getValues();
            const serverCompletedPatterns = new Set();
            for (let i = 1; i < lbValues.length; i++) {
                const row = lbValues[i];
                if (row[1] && row[1].toString().trim().toUpperCase() === cleanPlayerName) {
                    serverCompletedPatterns.add(row[0].toString().trim());
                }
            }

            const newPatterns = [];
            if (patterns && patterns.length) {
                for (const pattern of patterns) {
                    const indicesStr = pattern["tileindices"] || pattern["TileIndices"];
                    const nameStr = (pattern["patternname"] || pattern["PatternName"]).toString().trim();
                    if (indicesStr) {
                        const patternIndices = indicesStr.toString().split(",").map(Number);
                        const isMathematicallyComplete = patternIndices.every((index) =>
                            playerClickedIndices.has(index)
                        );
                        if (isMathematicallyComplete && !serverCompletedPatterns.has(nameStr)) {
                            newPatterns.push(nameStr);
                        }
                    }
                }
            }

            const timestamp = new Date();
            
            // 1. Write to Leaderboard
            if (newPatterns.length > 0) {
                newPatterns.forEach((pName) => {
                    leaderboardSheet.appendRow([pName, data.playerName, timestamp]);
                });
            }

            // 2. Write to EntriesLog (Targeting specific empty row in A-E)
            const nextRow = getNextAvailableRow(entriesSheet, 1); 

            // Prepare the row data (6 columns: A to F)
            const rowData = [
                timestamp,
                data.playerName,
                data.tileIndex,
                data.questionText,
                cleanAnswer,
                newPatterns.join(", "),
            ];

            // Write data explicitly to the calculated row range
            entriesSheet.getRange(nextRow, 1, 1, 6).setValues([rowData]);

            return newPatterns;
        } catch (e) {
            return { error: "Write failed: " + e.message };
        } finally {
            lock.releaseLock();
        }
    } else {
        return { error: "Server is busy. Please wait..." };
    }
}

// --- HELPER FUNCTION ---

function getNextAvailableRow(sheet, columnCheckIndex) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 2;
    const values = sheet.getRange(1, columnCheckIndex, lastRow + 20, 1).getValues(); 
    for (let i = values.length - 1; i >= 0; i--) {
        if (values[i][0] !== "" && values[i][0] != null) {
            return i + 2; 
        }
    }
    return 2; 
}

// --- ADMIN & HELPERS ---

function getAdminPatterns(authKey) {
    verifyAdmin(authKey);
    ensureSheetAndHeadersExist("Patterns");
    const patterns = getSheetData("Patterns");
    return {
        patterns: patterns.map((p) => ({
            PatternID: p["patternid"],
            PatternName: p["patternname"],
            TileIndices: p["tileindices"],
        })),
    };
}

function addPattern(patternData, authKey) {
    const lock = LockService.getScriptLock();
    try {
        verifyAdmin(authKey);
        lock.waitLock(30000);
        const sheet = ensureSheetAndHeadersExist("Patterns");
        const data = JSON.parse(patternData);
        sheet.appendRow([Utilities.getUuid(), data.name, data.indices]);
        CacheService.getScriptCache().remove("patterns_data");
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        lock.releaseLock();
    }
}

function deletePattern(patternId, authKey) {
    const lock = LockService.getScriptLock();
    try {
        verifyAdmin(authKey);
        lock.waitLock(30000);
        const sheet = ensureSheetAndHeadersExist("Patterns");
        const data = sheet.getDataRange().getValues();
        const rowIndex = data.findIndex((row) => row[0] && row[0].toString() === patternId.toString()) + 1;
        if (rowIndex > 0) {
            sheet.deleteRow(rowIndex);
            CacheService.getScriptCache().remove("patterns_data");
            return { success: true };
        }
        return { success: false, error: "Pattern not found." };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        lock.releaseLock();
    }
}

function clearServerCache(authKey) {
    try {
        verifyAdmin(authKey);
        const cache = CacheService.getScriptCache();
        cache.remove("questions_data");
        cache.remove("patterns_data");
        cache.remove("DYNAMIC_SCHEDULE_CONFIG"); // Also clear time cache
        return { success: true, message: "System cache cleared." };
    } catch (e) {
        return { error: e.message };
    }
}

function ensureSheetAndHeadersExist(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        const headers = SHEET_CONFIG[sheetName];
        if (headers) sheet.appendRow(headers);
    }
    return sheet;
}

function getCachedData(key) {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    return cached ? JSON.parse(cached) : null;
}

function setCachedData(key, data, exp) {
    try {
        CacheService.getScriptCache().put(key, JSON.stringify(data), exp);
    } catch (e) {}
}

function getSheetData(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol === 0) return [];
    
    // Get all data
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values.shift().map((h) => (h ? h.toString().replace(/\s+/g, "").toLowerCase() : ""));
    
    return values
        .filter((row) => {
             // Only keep rows that have data in the first 5 columns (A-E)
             return row.slice(0, 5).some(cell => cell !== "");
        })
        .map((row) => {
            let obj = {};
            headers.forEach((h, i) => {
                if (h) obj[h] = row[i];
            });
            return obj;
        });
}
