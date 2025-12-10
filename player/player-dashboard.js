// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Get elements
const playerNameElement = document.getElementById("player-name");
const logoutBtn = document.getElementById("logout-btn");
const markAttendanceBtn = document.getElementById("mark-attendance");
const attendanceMessage = document.getElementById("attendance-message");
const attendanceList = document.getElementById("attendance-list");

// Helper to capitalize
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

// Load user profile from Firestore instead of localStorage
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();

            const roleTitle = capitalize(data.role); // Player, Captain, Coach
            const fullName = data.name; // Full name as entered in signup

            playerNameElement.textContent = `${roleTitle} ${fullName}`;
        } else {
            playerNameElement.textContent = "Player (Unknown)";
        }
    } catch (err) {
        console.error("Error fetching user profile:", err);
        playerNameElement.textContent = "Player";
    }
});

// Handball field coordinates (polygon)
const handballField = [
    [-0.5139614631894397, 37.45711996026331],
    [-0.5142979996425096, 37.45759256240965],
    [-0.5142586177180668, 37.45713786185976],
    [-0.5143660229659767, 37.45739922516797]
];

// Check if player is inside polygon
function isPointInPolygon(point, polygon) {
    const [lat, lon] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lonI] = polygon[i];
        const [latJ, lonJ] = polygon[j];

        const intersect =
            (lonI > lon) !== (lonJ > lon) &&
            lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;

        if (intersect) inside = !inside;
    }
    return inside;
}

// Load attendance records from localStorage
function loadAttendance() {
    const attendanceData = JSON.parse(localStorage.getItem("attendanceRecords")) || [];
    attendanceList.innerHTML = "";

    if (attendanceData.length === 0) {
        attendanceList.innerHTML = "<li>No attendance records yet.</li>";
    } else {
        attendanceData.forEach(record => {
            const li = document.createElement("li");
            li.textContent = record;
            attendanceList.appendChild(li);
        });
    }
}

// Mark attendance with location check
markAttendanceBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        attendanceMessage.textContent = "❌ Geolocation not supported.";
        return;
    }

    attendanceMessage.textContent = "📍 Checking your location...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (isPointInPolygon([lat, lon], handballField)) {
                const now = new Date();
                const dateTime = now.toLocaleString();

                const attendanceData = JSON.parse(localStorage.getItem("attendanceRecords")) || [];
                attendanceData.push(dateTime);
                localStorage.setItem("attendanceRecords", JSON.stringify(attendanceData));

                attendanceMessage.textContent = `✅ Attendance marked successfully at ${dateTime}`;
                loadAttendance();
            } else {
                attendanceMessage.textContent = "⚠️ You must be within the handball field to mark attendance.";
            }
        },
        (error) => {
            attendanceMessage.textContent = "❌ Location access denied or unavailable.";
            console.error(error);
        }
    );
});

// Logout
logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("attendanceRecords");
    window.location.href = "../login.html";
});

// Load attendance on page load
loadAttendance();
