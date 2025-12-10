// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    addDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    getDoc, 
    doc, 
    Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// --- GLOBAL STATE ---
let db = null;
let auth = null;
let currentUserId = null;
let unsubscribePersonalAttendance = null;
let unsubscribeTeamData = null;

// --- COLLECTION PATH ---
const TEAM_ATTENDANCE_COLLECTION = "teamAttendance"; // adjust if needed

// --- ROLE TEXT ---
const RoleMapping = {
    player: "Player",
    captain: "Captain",
    coach: "Coach"
};

// --- DOM ELEMENTS ---
const playerNameElement = document.getElementById("player-name");
const logoutBtn = document.getElementById("logout-btn");
const markAttendanceBtn = document.getElementById("mark-attendance");
const attendanceMessage = document.getElementById("attendance-message");
const personalAttendanceList = document.getElementById("personal-attendance-list");
const teamDataList = document.getElementById("team-data-list");
const loadingOverlay = document.getElementById("loading-view");
const teamLoadingSpinner = document.getElementById("team-loading");

// --- HAND BALL FIELD COORDINATES ---
const handballField = [
    [37.45711996026331, -0.5139614631894397],
    [37.45759256240965, -0.5142979996425096],
    [37.45713786185976, -0.5142586177180668],
    [37.45739922516797, -0.5143660229659767]
];

// --- HELPERS ---
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

function isPointInPolygon(point, polygon) {
    const [lat, lon] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lonI] = polygon[i];
        const [latJ, lonJ] = polygon[j];
        const intersect = (lonI > lon) !== (lonJ > lon) &&
                          lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
        if (intersect) inside = !inside;
    }
    return inside;
}

async function getUserDetails(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return { name: "Unknown User", role: "captain" };
        return snap.data(); // {name, email, role}
    } catch (err) {
        console.error("Failed to load user details:", err);
        return { name: "Unknown User", role: "captain" };
    }
}

// --- PERSONAL ATTENDANCE UI ---
function updatePersonalAttendanceList(records) {
    personalAttendanceList.innerHTML = "";
    if (!records.length) {
        personalAttendanceList.innerHTML = `<li class="p-2 bg-gray-100 text-gray-600 rounded-md border-l-4 border-gray-400">No personal records yet.</li>`;
        return;
    }
    records.forEach(rec => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>✅ ${rec.timestamp.toDate().toLocaleString()}</strong>`;
        personalAttendanceList.appendChild(li);
    });
}

// --- TEAM DATA UI ---
function updateTeamDataList(records) {
    teamLoadingSpinner.classList.add("hidden");
    teamDataList.innerHTML = "";
    if (!records.length) {
        teamDataList.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-gray-500">No team attendance records found.</td></tr>`;
        return;
    }

    const grouped = {};
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    records.forEach(r => {
        if (!grouped[r.userId]) grouped[r.userId] = { name: r.userName, role: r.userRole, count: 0 };
        if (r.timestamp.toDate() > oneWeekAgo) grouped[r.userId].count++;
    });

    Object.values(grouped).forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium">${p.name} <span class="text-xs text-gray-500">(${RoleMapping[p.role] || "User"})</span></td>
            <td class="py-3 px-4 text-center font-bold text-green-600">${p.count} / 7</td>
            <td class="py-3 px-4 text-center text-gray-600">N/A</td>
            <td class="py-3 px-4 text-center text-gray-600">N/A</td>
        `;
        teamDataList.appendChild(tr);
    });
}

// --- LOAD PERSONAL ATTENDANCE ---
function loadPersonalAttendance(uid) {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance();
    const ref = collection(db, TEAM_ATTENDANCE_COLLECTION);
    const q = query(ref, where("userId", "==", uid));
    unsubscribePersonalAttendance = onSnapshot(q, snap => {
        const rec = [];
        snap.forEach(doc => rec.push(doc.data()));
        rec.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        updatePersonalAttendanceList(rec);
    });
}

// --- LOAD TEAM DATA ---
function loadTeamData() {
    if (unsubscribeTeamData) unsubscribeTeamData();
    const ref = collection(db, TEAM_ATTENDANCE_COLLECTION);
    unsubscribeTeamData = onSnapshot(ref, snap => {
        const rec = [];
        snap.forEach(doc => rec.push(doc.data()));
        updateTeamDataList(rec);
    });
}

// --- MARK ATTENDANCE ---
async function markAttendance(locationData, userDetails) {
    try {
        const ref = collection(db, TEAM_ATTENDANCE_COLLECTION);
        await addDoc(ref, {
            userId: currentUserId,
            userName: userDetails.name,
            userRole: userDetails.role,
            timestamp: Timestamp.now(),
            lat: locationData.latitude,
            lon: locationData.longitude
        });
        attendanceMessage.textContent = `Attendance marked successfully at ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        attendanceMessage.textContent = "Error saving attendance.";
        console.error(err);
    }
}

function handleMarkAttendanceClick(userDetails) {
    if (!navigator.geolocation) {
        attendanceMessage.textContent = "Geolocation not supported.";
        return;
    }
    markAttendanceBtn.disabled = true;
    markAttendanceBtn.innerHTML = `<span class="loader mr-2"></span>Checking location...`;
    navigator.geolocation.getCurrentPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            if (isPointInPolygon([lat, lon], handballField)) {
                markAttendance({ latitude: lat, longitude: lon }, userDetails);
            } else {
                attendanceMessage.textContent = "You are not inside the handball field area.";
            }
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.textContent = "Mark Present";
        },
        err => {
            attendanceMessage.textContent = "Location error. Please allow access.";
            console.error(err);
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.textContent = "Mark Present";
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
}

// --- LOGOUT ---
function handleLogout() {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance();
    if (unsubscribeTeamData) unsubscribeTeamData();
    signOut(auth).finally(() => window.location.reload());
}

// --- INIT DASHBOARD ---
async function initDashboard(uid) {
    const userDetails = await getUserDetails(uid);
    playerNameElement.textContent = `Captain ${userDetails.name}`;

    markAttendanceBtn.addEventListener("click", () => handleMarkAttendanceClick(userDetails));
    logoutBtn.addEventListener("click", handleLogout);

    loadPersonalAttendance(uid);
    loadTeamData();

    loadingOverlay.classList.add("hidden");
}

// --- INITIALIZE APP ---
function initializeCaptainDashboard() {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            initDashboard(currentUserId);
        } else {
            document.getElementById("loading-message").textContent = "Please login first.";
        }
    });
}

window.onload = initializeCaptainDashboard;

