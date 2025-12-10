import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// --- Firebase Init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements ---
const coachNameElement = document.getElementById("coach-name");
const logoutBtn = document.getElementById("logout-btn");
const loadingOverlay = document.getElementById("loading-view");
const teamAttendanceList = document.getElementById("team-attendance-list");

// --- Helpers ---
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

// --- Load Dashboard ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {
        // Fetch coach profile
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            coachNameElement.textContent = `Coach ${data.name}`;
        } else {
            coachNameElement.textContent = "Coach (Unknown)";
        }

        // Fetch all team attendance
        const teamCollection = collection(db, "teamAttendance");
        const teamSnapshot = await getDocs(teamCollection);

        // Process attendance per user
        const attendanceByUser = {};

        teamSnapshot.forEach(doc => {
            const record = doc.data();
            const uid = record.userId;
            const ts = record.timestamp;

            if (!attendanceByUser[uid]) {
                attendanceByUser[uid] = {
                    name: record.userName || "Unknown",
                    role: record.userRole || "Player",
                    dates: [],
                };
            }

            // Only keep last 7 days
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            if (ts.toDate() > oneWeekAgo) {
                attendanceByUser[uid].dates.push(ts.toDate());
            }
        });

        // Render table
        teamAttendanceList.innerHTML = "";
        if (Object.keys(attendanceByUser).length === 0) {
            teamAttendanceList.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No attendance records yet.</td></tr>`;
        } else {
            Object.values(attendanceByUser).forEach(player => {
                const tr = document.createElement("tr");
                const recentDates = player.dates.map(d => d.toLocaleDateString()).join(", ");
                tr.innerHTML = `
                    <td class="py-2 px-4">${player.name}</td>
                    <td class="py-2 px-4 text-center">${capitalize(player.role)}</td>
                    <td class="py-2 px-4 text-center font-bold">${player.dates.length}</td>
                    <td class="py-2 px-4 text-center">${recentDates || '-'}</td>
                `;
                teamAttendanceList.appendChild(tr);
            });
        }

    } catch (err) {
        console.error("Error loading dashboard:", err);
        teamAttendanceList.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Failed to load data</td></tr>`;
    } finally {
        loadingOverlay.classList.add("hidden");
    }
});

// --- Logout ---
logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "../login.html";
    } catch (err) {
        console.error("Logout failed:", err);
        window.location.reload();
    }
});

