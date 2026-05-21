const token = localStorage.getItem("token");
const MESSAGE_SECRET = "chatappsecret";
// ===== STOP if no token =====
if (!token) {
alert("Please login first");
window.location.href = "index.html";
}

// ===== CONNECT SOCKET WITH TOKEN =====
const socket = io({
auth: { token }
});

// ===== GET USERNAME FROM TOKEN =====
function getUsernameFromToken(token) {
try {
const payload = JSON.parse(atob(token.split('.')[1]));
return payload.username;
} catch {
return "Guest";
}
}

const username = getUsernameFromToken(token);

// ===== ELEMENTS =====
const msgInput = document.getElementById("msg");
const messagesBox = document.getElementById("messages");
const typingDiv = document.getElementById("typing");

// ===== CONNECT =====
socket.on("connect", () => {
console.log("Connected:", socket.id);
socket.emit("join"); // no username needed
});

// ===== SEND MESSAGE =====
function sendMessage() {
if (!msgInput) return;


const text = msgInput.value.trim();
if (!text) return;

const message = {
    id: Date.now(),
    user: username,
    text: text,
    status: "sent"
};

socket.emit("sendMessage", message);
addMessage(message, true);

msgInput.value = "";


}

// ===== RECEIVE MESSAGE =====
socket.on("receiveMessage", (msg) => {

    // Decrypt message
    try {

        const bytes = CryptoJS.AES.decrypt(
            msg.text,
            MESSAGE_SECRET
        );

        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Replace encrypted text
        if (decryptedText) {
            msg.text = decryptedText;
        }

    } catch (err) {
        console.log("Decrypt error");
    }

    const isOwn = msg.user === username;

    if (!isOwn) {
        new Notification("New Message", {
    body: `${msg.user}: ${msg.text}`
});
        addMessage(msg, false);
        socket.emit("delivered", msg.id);
    }
});

// ===== ADD MESSAGE =====
function addMessage(msg, isOwn) {
if (!messagesBox) return;


const div = document.createElement("div");
div.classList.add("message", isOwn ? "sent" : "received");

div.setAttribute("data-id", msg.id);

div.innerHTML = `
    <small>${msg.user}</small><br>
    ${msg.text}
    ${isOwn ? `<div class="tick">${getStatusIcon(msg.status)}</div>` : ""}
`;

messagesBox.appendChild(div);
messagesBox.scrollTop = messagesBox.scrollHeight;


}

// ===== STATUS ICON =====
function getStatusIcon(status) {
if (status === "sent") return "✓";
if (status === "delivered") return "✓✓";
return "";
}

// ===== UPDATE STATUS =====
socket.on("updateStatus", ({ id, status }) => {
const tick = document.querySelector(`[data-id='${id}'] .tick`);
if (tick) tick.innerText = getStatusIcon(status);
});

// ===== TYPING =====
if (msgInput) {
msgInput.addEventListener("input", () => {
socket.emit("typing", username);
});
}

socket.on("typing", (user) => {
if (!typingDiv || user === username) return;

typingDiv.innerText = `${user} is typing...`;

clearTimeout(window.typingTimeout);
window.typingTimeout = setTimeout(() => {
    typingDiv.innerText = "";
}, 1500);


});

// ===== ONLINE USERS =====
socket.on("onlineUsers", (users) => {
console.log("Online:", users);
});

// ===== LAST SEEN =====
socket.on("lastSeen", ({ user, time }) => {
console.log(`${user} last seen at ${time}`);
});
