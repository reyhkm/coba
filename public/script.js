document.addEventListener('DOMContentLoaded', () => {
    const roomNameInput = document.getElementById('room-name');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const messagesList = document.getElementById('messages-list');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const connectionStatus = document.getElementById('connection-status');

    let socket = null;
    let currentRoom = '';
    // Ganti dengan ID unik untuk user ini, bisa dari localStorage atau dibuat saat load
    const userId = localStorage.getItem('chatUserId') || `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chatUserId', userId);


    function getWebSocketURL(room) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Penting: Sesuaikan 'chat-do' jika binding Durable Object Anda berbeda di wrangler.toml
        // dan PartyServer meroutenya dengan nama lain.
        // Biasanya routePartykitRequest akan menggunakan kebab-case dari nama binding.
        // Jika binding Anda `CHAT_DO`, maka party nya `chat-do`.
        const partyName = "chat-do"; // Sesuaikan jika perlu
        return `${wsProtocol}//${window.location.host}/parties/${partyName}/${room}`;
    }


    function connectWebSocket(room) {
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom === room) {
            console.log(`Already connected to room: ${room}`);
            return;
        }

        if (socket) {
            socket.close();
        }

        currentRoom = room;
        const wsURL = getWebSocketURL(room);
        socket = new WebSocket(wsURL);
        connectionStatus.textContent = 'Menyambung...';
        messagesList.innerHTML = ''; // Bersihkan pesan lama saat ganti room

        socket.onopen = () => {
            console.log(`Connected to room: ${room}`);
            connectionStatus.textContent = `Online di '${room}'`;
            connectionStatus.style.color = 'lightgreen';
            messageInput.disabled = false;
            sendButton.disabled = false;
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Message from server:', data);

                if (data.type === 'all' && Array.isArray(data.messages)) {
                    // Load semua histori pesan
                    data.messages.forEach(msg => displayMessage(msg));
                } else if (data.id && data.content) { // Asumsi ini adalah ChatMessage tunggal
                    displayMessage(data);
                } else if (data.error) {
                    displaySystemMessage(`Error: ${data.error}`, 'error');
                }
                 // Scroll ke pesan terbaru (karena flex-direction: column-reverse)
                messagesList.scrollTop = 0; // atau messagesList.scrollTo(0,0)

            } catch (error) {
                console.error('Failed to parse message or invalid message structure:', event.data, error);
                // Tampilkan pesan mentah jika tidak bisa diparsing, sebagai fallback
                displaySystemMessage(`Pesan diterima (format tidak dikenal): ${event.data}`);
            }
        };

        socket.onclose = (event) => {
            console.log(`Disconnected from room: ${room}. Code: ${event.code}, Reason: ${event.reason}`);
            connectionStatus.textContent = 'Terputus';
            connectionStatus.style.color = 'salmon';
            messageInput.disabled = true;
            sendButton.disabled = true;
            // Opsional: coba sambung ulang
            // setTimeout(() => connectWebSocket(currentRoom), 5000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            connectionStatus.textContent = 'Error Koneksi';
            connectionStatus.style.color = 'red';
            displaySystemMessage('Koneksi WebSocket bermasalah.', 'error');
        };
    }

    function displayMessage(msg) {
        const item = document.createElement('div');
        item.classList.add('message-item');

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        // Cek apakah pesan dari user saat ini
        // Kita akan menandai pesan dari userId ini sebagai 'self'
        // Pastikan server Anda menyimpan `msg.user` dengan benar
        if (msg.user === userId) {
            item.classList.add('self');
            const userSpan = document.createElement('span');
            userSpan.classList.add('message-user');
            userSpan.textContent = 'Kamu (Gosipers)'; // Atau nama pengguna jika ada
            contentDiv.appendChild(userSpan);
        } else {
            item.classList.add('other');
            const userSpan = document.createElement('span');
            userSpan.classList.add('message-user');
            userSpan.textContent = msg.user ? `Gosipers ${msg.user.substring(0,6)}` : 'Anonim'; // Tampilkan ID user atau nama jika ada
            contentDiv.appendChild(userSpan);
        }


        const textPara = document.createElement('p');
        textPara.textContent = msg.content; // Asumsi msg.content adalah teks
        contentDiv.appendChild(textPara);

        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('message-timestamp');
        timestampSpan.textContent = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        contentDiv.appendChild(timestampSpan);

        item.appendChild(contentDiv);

        // Karena kita menggunakan flex-direction: column-reverse, kita prepend.
        messagesList.prepend(item); // Tambahkan ke atas agar muncul di bawah secara visual
        messagesList.scrollTop = messagesList.scrollHeight; // Scroll ke paling bawah (efektif karena reverse)

    }

    function displaySystemMessage(text, type = 'info') {
        const item = document.createElement('div');
        item.classList.add('message-item', 'system-message');
        if (type === 'error') {
            item.style.color = 'red';
            item.style.fontStyle = 'italic';
        }
        item.textContent = text;
        messagesList.prepend(item);
        messagesList.scrollTop = messagesList.scrollHeight;
    }

    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            const messagePayload = {
                // id: `msg_${Math.random().toString(36).substr(2, 9)}`, // Server sebaiknya generate ID jika perlu
                user: userId, // Kirim ID user
                role: "user",
                type: "text", // Untuk sekarang hanya teks
                content: messageText,
                timestamp: Date.now()
            };
            // Kita akan mengirim pesan dengan struktur yang diharapkan server
            // Bisa langsung objek ChatMessage, atau dibungkus 'add'/'update'
            // Untuk contoh ini, kita kirim langsung ChatMessage, server akan handle
            socket.send(JSON.stringify(messagePayload));
            messageInput.value = '';
            autoGrowTextarea(messageInput); // Kembalikan ukuran textarea
            messageInput.focus();
        }
    }

    // Fungsi untuk textarea auto-grow sederhana
    function autoGrowTextarea(element) {
        element.style.height = 'auto'; // Reset tinggi
        element.style.height = (element.scrollHeight) + 'px';
    }

    messageInput.addEventListener('input', () => autoGrowTextarea(messageInput));
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Mencegah baris baru di textarea
            sendMessage();
        }
    });

    sendButton.addEventListener('click', sendMessage);

    joinRoomBtn.addEventListener('click', () => {
        const room = roomNameInput.value.trim().toLowerCase().replace(/\s+/g, '-'); // Sanitasi nama room
        if (room) {
            connectWebSocket(room);
        } else {
            alert("Masukkan nama ruangan gosip dulu!");
        }
    });

    // Sambungkan ke room default saat halaman dimuat
    const defaultRoom = roomNameInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (defaultRoom) {
        connectWebSocket(defaultRoom);
    } else {
        connectionStatus.textContent = "Pilih ruangan...";
        messageInput.disabled = true;
        sendButton.disabled = true;
    }
});
